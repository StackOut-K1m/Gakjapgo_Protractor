package com.protractor.backend.domain.posture.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.protractor.backend.domain.calibration.service.CalibrationService;
import com.protractor.backend.domain.posture.dto.PostureBaseline;
import com.protractor.backend.domain.posture.dto.PostureEventMetadata;
import com.protractor.backend.domain.posture.dto.PostureFeatures;
import com.protractor.backend.domain.posture.dto.PostureFrameRequest;
import com.protractor.backend.domain.posture.dto.PostureFrameResponse;
import com.protractor.backend.domain.posture.dto.PosturePreviewResponse;
import com.protractor.backend.domain.posture.dto.PostureResult;
import com.protractor.backend.domain.posture.entity.PostureType;
import com.protractor.backend.domain.posture.service.PostureWindowTracker.Transition;
import com.protractor.backend.domain.studyrecord.entity.Event;
import com.protractor.backend.domain.studyrecord.entity.StudyRecord;
import com.protractor.backend.domain.studyrecord.repository.EventRepository;
import com.protractor.backend.domain.studyrecord.repository.StudyRecordRepository;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

/**
 * 자세 판정 흐름을 묶는다. 피처 수신 → 판정 → 30초 지속 확인 → 이벤트 저장까지가 한 줄기다.
 *
 * <p>
 * 판정을 브라우저가 아니라 서버에서 하는 이유는 두 가지다. 첫째, 점수와 랭킹의 원천이라 클라이언트가 보낸 결과를 믿으면 조작이 가능하다.
 * 둘째, 판정 방식 3종을 비교할 때 기기 성능 차이가 변수로 섞이지 않아야 한다.
 *
 * <p>
 * 판정기는 {@link PostureDetectorRegistry} 한 곳으로만 연결된다. 방식이 몇 개가 되든 이 서비스는 바뀌지 않는다.
 */
@Service
public class PostureAnalysisService {

	private static final Logger log = LoggerFactory.getLogger(PostureAnalysisService.class);

	/** events.event_type 값. 자세 이벤트만 골라 닫을 때 쓴다. */
	private static final String POSTURE_EVENT_TYPE = "POSTURE";

	private final StudyRecordRepository studyRecordRepository;
	private final EventRepository eventRepository;
	private final CalibrationService calibrationService;
	private final PostureDetectorRegistry detectors;
	private final PostureWindowTracker tracker;
	private final ObjectMapper objectMapper;
	private final String alertChannel;

	public PostureAnalysisService(StudyRecordRepository studyRecordRepository, EventRepository eventRepository,
			CalibrationService calibrationService, PostureDetectorRegistry detectors, PostureWindowTracker tracker,
			ObjectMapper objectMapper, @Value("${app.posture.alert-channel}") String alertChannel) {
		this.studyRecordRepository = studyRecordRepository;
		this.eventRepository = eventRepository;
		this.calibrationService = calibrationService;
		this.detectors = detectors;
		this.tracker = tracker;
		this.objectMapper = objectMapper;
		this.alertChannel = alertChannel;
	}

	/**
	 * 세션도 기준선도 없이 프레임 한 장만 판정한다. 입장 준비화면이 쓴다.
	 *
	 * <p>
	 * 아무것도 저장하지 않고 30초 윈도우도 거치지 않는다. 읽기만 하므로 트랜잭션도 열지 않는다.
	 *
	 * <p>
	 * 준비화면에 이것이 필요한 이유는 기준 자세를 등록하는 순간이 곧 자세가 바라야 하는 순간이기 때문이다. 그때는 기준선이 아직 없어
	 * {@link #analyze}를 쓸 수 없고(전부 NO_BASELINE 보류가 된다), 그래서 거북목인 채로 기준선을 등록해도 통과했다.
	 * 판정 자체는 {@link PostureDetector#preview}가 하며, 절대 기준을 학습한 모델을 가진 판정기만 실제로 답한다.
	 */
	public PosturePreviewResponse preview(PostureFrameRequest request) {
		PostureDetector detector = detectors.resolve(request.detector());
		return PosturePreviewResponse.of(detector.preview(request.features()), detector.key());
	}

	/**
	 * 프레임 한 장을 판정하고, 30초 지속이 확인된 자세만 이벤트로 남긴다.
	 * @param studyRecordId 세션 id
	 * @param request 브라우저가 보낸 피처 벡터
	 */
	@Transactional
	public PostureFrameResponse analyze(Long studyRecordId, PostureFrameRequest request) {
		StudyRecord record = studyRecordRepository.findById(studyRecordId).orElseThrow(
				() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "스터디 기록(세션)을 찾을 수 없습니다: " + studyRecordId));

		PostureFeatures features = request.features();
		PostureBaseline baseline = calibrationService.getBaseline(record.getMemberId());
		// 요청이 방식을 지정했으면 그것으로, 아니면 서버 기본값으로 판정한다. 모르는 키는 여기서 400으로 막힌다.
		PostureDetector detector = detectors.resolve(request.detector());
		// 실제 추론. 결과로 나올 수 있는 것은 3종 자세 각각의 판정과, 판정 보류된 항목
		PostureResult result = detector.detect(features, baseline);

		// 시각은 서버 것을 쓴다. 클라이언트 시계는 어긋나거나 조작될 수 있고, 이 값이 곧 나쁜 자세 시간이 된다.
		LocalDateTime now = LocalDateTime.now();

		List<PostureType> confirmed = new ArrayList<>();
		List<PostureType> resolved = new ArrayList<>();

		// 프레임이 끊겼다 다시 온 것이라면, 끊기기 직전에 열려 있던 이벤트를 그 시각에서 닫는다.
		// 스트레칭·휴식 중에는 프레임이 오지 않는데, 이벤트를 열어 둔 채로 두면 측정하지 않은 시간까지 나쁜 자세가 된다.
		// 그때 경고 중이던 자세는 resolved 로 알린다 — 윈도우가 비워져 RESOLVED 전이가 다시는
		// 나오지 않으므로, 여기서 알리지 않으면 화면 경고가 영영 남는다(스트레칭 뒤 경고 화면에 갇히던 버그).
		tracker.markFrameAndDetectGap(studyRecordId, now).ifPresent(gap -> {
			closeOpenPostureEvents(studyRecordId, gap.pausedAt(), "MEASUREMENT_PAUSED");
			resolved.addAll(gap.alertingTypes());
		});

		List<Transition> transitions = tracker.apply(studyRecordId, result.judgements(), now);

		for (Transition transition : transitions) {
			if (transition.isAlerting()) {
				// 지속 알림(SUSTAINED)은 이벤트를 새로 열지 않는다. 이미 열려 있는 이벤트가 해소될 때
				// 그 길이로 기록되므로, 여기서 또 열면 닫히지 않는 행이 쌓인다.
				if (transition.isConfirmed()) {
					openEvent(studyRecordId, transition, baseline, features, detector);
				}
				confirmed.add(transition.type());
			} else {
				closeEvent(studyRecordId, transition);
				resolved.add(transition.type());
			}
		}
		// 보낸 값이 아니라 실제로 쓰인 판정기를 돌려준다. 지정하지 않았으면 기본값이 쓰였다는 뜻이다.
		return PostureFrameResponse.of(result, confirmed, resolved, detector.key());
	}

	/**
	 * 세션이 끝날 때 정리한다. 열려 있던 이벤트를 닫고 메모리에 쌓인 판정 이력을 버린다.
	 *
	 * <p>
	 * 닫지 않으면 duration_seconds가 비어서 그 시간만큼 bad_posture_seconds 합계에서 빠진다.
	 *
	 * <p>
	 * 버리기 전에 이 세션에서 나쁜 자세로 읽힌 초를 돌려준다. 이력을 지우고 나면 물어볼 수 없으므로 정리와 같은 호출에서 함께
	 * 넘긴다 — 따로 두면 "지우기 전에 읽어야 한다"는 순서를 호출 측이 기억해야 한다.
	 *
	 * @return 나쁜 자세로 읽힌 초(확정 여부와 무관). 서버 재시작 등으로 이력이 없으면 0
	 */
	@Transactional
	public int finish(Long studyRecordId) {
		// 마지막으로 프레임을 받은 시각에서 닫는다. 창을 닫아 끝난 세션은 서버가 한참 뒤에야 종료를 알아채는데,
		// 그 시각으로 닫으면 아무도 보지 않은 시간까지 나쁜 자세로 남는다. 프레임을 한 장도 못 받았으면 지금으로 둔다.
		LocalDateTime closedAt = tracker.lastFrameAt(studyRecordId).orElseGet(LocalDateTime::now);
		// 판정 이력이 아니라 테이블에 열려 있는 행을 기준으로 닫는다. 서버가 재시작되면 이력은 사라져도 행은 남기 때문이다.
		closeOpenPostureEvents(studyRecordId, closedAt, "SESSION_END");
		int badPostureSeconds = tracker.badPostureSeconds(studyRecordId);
		tracker.clear(studyRecordId);
		return badPostureSeconds;
	}

	/**
	 * 아직 닫히지 않은 자세 이벤트를 한 번에 닫는다.
	 *
	 * <p>
	 * 종료 시각이 시작보다 앞서면 지속 시간이 음수가 되므로 시작 시각으로 맞춰 0초로 남긴다. 측정이 멈춘 뒤에 열린 이벤트는 없어야 하지만,
	 * 서버 재시작으로 판정 이력을 잃은 뒤에는 그런 행이 남을 수 있다.
	 */
	private void closeOpenPostureEvents(Long studyRecordId, LocalDateTime at, String reason) {
		List<Event> open = eventRepository.findByStudyRecordIdAndEventTypeAndEndedAtIsNull(studyRecordId,
				POSTURE_EVENT_TYPE);
		for (Event event : open) {
			event.resolve(at.isBefore(event.getStartedAt()) ? event.getStartedAt() : at, reason);
		}
	}

	/**
	 * 확정된 나쁜 자세를 이벤트로 연다. 종료 시각은 해소될 때 채운다.
	 *
	 * <p>
	 * 판정기를 인자로 받는 이유는, 30초 윈도우가 채워지는 동안 사용자가 방식을 바꿨을 수 있어서다. 필드로 들고 있으면 어느 시점 값인지
	 * 불분명해진다. 여기 남는 이름이 나중에 방식별 정확도를 나누는 기준이 된다.
	 */
	private void openEvent(Long studyRecordId, Transition transition, PostureBaseline baseline,
			PostureFeatures features, PostureDetector detector) {
		PostureType type = transition.type();
		// bodyPart와 detail을 모두 채우는 postureDetected를 쓴다. detail이 비면 종료 시 종류별 점수를 나눠 셀 수 없다.
		Event event = Event.postureDetected(studyRecordId, type.bodyPart(), type.detail(), transition.maxDeviation(),
				alertChannel, transition.maxSeverity(), transition.startedAt(), null, null, null,
				toJson(new PostureEventMetadata(detector.name(), PostureFeatures.VERSION, baseline, features,
						transition.maxSeverity())));
		eventRepository.save(event);
	}

	/** 해소된 자세의 열린 이벤트에 종료 시각과 지속 시간을 채운다. */
	private void closeEvent(Long studyRecordId, Transition transition) {
		eventRepository
				.findFirstByStudyRecordIdAndDetailAndEndedAtIsNullOrderByStartedAtDesc(studyRecordId,
						transition.type().detail())
				.ifPresent(event -> event.resolve(transition.occurredAt(), "POSTURE_RECOVERED"));
	}

	/**
	 * 판정 근거를 JSON으로 만든다.
	 *
	 * <p>
	 * 근거를 못 남기더라도 이벤트 자체는 저장돼야 한다. 사용자에게 경고를 주는 것이 먼저고, 근거는 나중 분석용이기 때문이다.
	 */
	private String toJson(PostureEventMetadata metadata) {
		try {
			return objectMapper.writeValueAsString(metadata);
		} catch (JsonProcessingException e) {
			log.warn("자세 이벤트 판정 근거를 직렬화하지 못했습니다. 근거 없이 저장합니다.", e);
			return null;
		}
	}
}
