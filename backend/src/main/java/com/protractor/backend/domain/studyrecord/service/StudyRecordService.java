package com.protractor.backend.domain.studyrecord.service;

import com.protractor.backend.domain.posture.entity.PostureType;
import com.protractor.backend.domain.posture.service.PostureAnalysisService;
import com.protractor.backend.domain.studyrecord.dto.ActiveUsersResponse;
import com.protractor.backend.domain.studyrecord.dto.EndRequest;
import com.protractor.backend.domain.studyrecord.dto.EndResponse;
import com.protractor.backend.domain.studyrecord.dto.PostureCheckRequest;
import com.protractor.backend.domain.studyrecord.dto.PostureInterval;
import com.protractor.backend.domain.studyrecord.dto.ProgressRequest;
import com.protractor.backend.domain.studyrecord.dto.ProgressResponse;
import com.protractor.backend.domain.studyrecord.dto.StudyRecordDetailResponse;
import com.protractor.backend.domain.studyrecord.dto.StudySummaryResponse;
import com.protractor.backend.domain.studyrecord.entity.Event;
import com.protractor.backend.domain.studyrecord.entity.StudyRecord;
import com.protractor.backend.domain.studyrecord.repository.EventRepository;
import com.protractor.backend.domain.studyrecord.repository.StudyRecordRepository;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.DayOfWeek;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

/**
 * 스터디 기록(세션) 진행 동기화와 종료 처리를 담당한다.
 *
 * 측정값(focused/break/away)은 클라이언트가 종료 시점에 보내고, 점수·자세 지표는 서버가 저장된 events를 집계해 계산한다.
 * 클라이언트가 보낸 점수를 신뢰하면 값 조작이 가능하기 때문이다.
 *
 * 감지 이벤트는 종료 요청으로 오지 않는다. 자세는 서버가 실시간 판정으로, 턱 괴기·졸음·휴대폰은 브라우저가 각자의 실시간 입구로 그때그때
 * 저장해 둔다. 종료 시점에는 이미 쌓여 있는 것을 집계하기만 한다.
 *
 * 점수는 전부 "시간 비율" 기반이다(2026-08-04 개편). 건수당 감점(-10점)은 지속 시간·세션 길이를
 * 무시해 오래 공부할수록 0점으로 수렴하는 왜곡이 있어 폐기했다. 각 공식은 계산 지점의 주석 참고.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class StudyRecordService {

	private static final BigDecimal HUNDRED = new BigDecimal("100.00");
	/** 연속 학습일수를 거슬러 올라가며 찾을 최대 범위(일). 이보다 긴 연속 기록은 사실상 없다. */
	private static final int STREAK_LOOKBACK_DAYS = 400;

	/** 사용자가 끝낸 것이 아니라 날짜가 바뀌어 마감된 기록의 종료 사유. */
	private static final String END_REASON_DATE_ROLLOVER = "DATE_ROLLOVER";

	private final StudyRecordRepository studyRecordRepository;
	private final EventRepository eventRepository;
	private final PostureAnalysisService postureAnalysisService;

	/**
	 * 진행 동기화. 클라이언트가 보낸 누적값으로 덮어쓴다.
	 *
	 * <p>
	 * 더하지 않고 덮어쓰기 때문에 중간에 전송이 한 번 실패해도 다음 호출에서 복구된다. 점수 계산은 하지 않는다(30~60초마다 호출되므로
	 * 가볍게 유지).
	 */
	@Transactional
	public ProgressResponse progress(Long studyRecordId, Long memberId, ProgressRequest request) {
		StudyRecord record = findOwnedOrThrow(studyRecordId, memberId);
		// 이미 종료된 세션에 늦게 도착한 progress는 무시한다. 그대로 덮어쓰면 종료 시 계산한 값이 망가진다.
		if (record.getEndReason() != null) {
			throw new ResponseStatusException(HttpStatus.CONFLICT, "이미 종료된 세션입니다: " + studyRecordId);
		}

		StudyRecord rolled = rolloverIfDateChanged(record, request.focusedSeconds());
		if (rolled != null) {
			// 자정을 지났다. 어제 몫은 마감했고, 이번 요청의 나머지는 오늘 행에 담겨 있다.
			// 응답의 studyRecordId가 새 값이므로 클라이언트는 이후 요청을 이 id로 보내야 한다.
			return ProgressResponse.from(rolled);
		}

		record.syncProgress(request.focusedSeconds(), request.breakSeconds(), request.awaySeconds());
		return ProgressResponse.from(record);
	}

	/**
	 * 자정을 지났으면 어제 행을 마감하고 오늘 행으로 넘긴다. 넘겼으면 새 행을, 아니면 null을 돌려준다.
	 *
	 * <p>
	 * 학습 기록은 "방 × 회원 × 학습일" 단위다. 23시에 시작해 1시에 끝낸 공부를 한 행에 두면 두 시간이 전부 어제 몫이
	 * 되어, 홈의 "오늘 공부 시간"에도 랭킹에도 오늘 것이 하나도 안 잡힌다. 그래서 날짜가 바뀐 것을 발견한 시점에 행을 나눈다.
	 *
	 * <p>
	 * <b>시간을 나누는 방법.</b> 클라이언트가 보내는 값은 이 방에서의 누적 시간이라, 서버는 "자정까지 몇 초였는지"를 알 수
	 * 없다. 대신 직전에 저장해 둔 값과의 차이를 쓴다. 그 차이는 마지막 동기화(최대 30초 전) 이후에 쌓인 몫이고, 자정 직후에
	 * 감지되므로 대부분 오늘 것이다. 저장된 값까지는 어제 행에 그대로 남긴다.
	 *
	 * <p>
	 * 그래서 <b>최대 30초 정도는 어제 쪽에 남는다.</b> 자정 정각에 정확히 자르려면 클라이언트가 경계를 알고 나눠 보내야
	 * 하는데, 그 정확도를 위해 계약을 복잡하게 만들 만한 차이는 아니라고 봤다.
	 *
	 * <p>
	 * 어제 행은 {@code DATE_ROLLOVER}로 마감하며 점수까지 계산한다. 사용자가 끝낸 것이 아니라 날짜가 바뀐 것이므로
	 * 나가기·이탈과 구분되는 사유를 남긴다.
	 */
	private StudyRecord rolloverIfDateChanged(StudyRecord record, int reportedFocusedSeconds) {
		LocalDate today = LocalDate.now();
		if (today.equals(record.getStudyDate())) {
			return null;
		}

		// 마지막 동기화 이후 쌓인 몫만 오늘로 넘긴다. 클라이언트가 더 적은 값을 보내는 일은 없어야 하지만,
		// 그런 경우에도 음수가 되지 않게 막는다.
		int carried = Math.max(reportedFocusedSeconds - record.getFocusedSeconds(), 0);
		endWithStoredProgress(record.getId(), END_REASON_DATE_ROLLOVER);

		StudyRecord next = studyRecordRepository.save(
				StudyRecord.startFrom(record.getStudyRoomId(), record.getMemberId(), today, carried));
		log.info("학습일이 바뀌어 기록을 나눴습니다. room={}, member={}, {}({}) → {}({}), 넘긴 시간={}초",
				record.getStudyRoomId(), record.getMemberId(), record.getStudyDate(), record.getId(), today,
				next.getId(), carried);
		return next;
	}

	/** 세션 종료. 최종 누적값을 확정하고, 세션 중 저장된 events를 집계해 점수를 계산한다. */
	@Transactional
	public EndResponse end(Long studyRecordId, Long memberId, EndRequest request) {
		StudyRecord record = findOwnedOrThrow(studyRecordId, memberId);
		// 종료 버튼 중복 클릭이나 재전송으로 end가 두 번 오면 무시한다. 두 번째 호출은 값을 다시 계산하며 제약을 깨뜨릴 수 있다.
		if (record.getEndReason() != null) {
			throw new ResponseStatusException(HttpStatus.CONFLICT, "이미 종료된 세션입니다: " + studyRecordId);
		}
		record.end(request.focusedSeconds(), request.breakSeconds(), request.awaySeconds(), request.endReason());

		// 집계 전에 열려 있는 자세 이벤트를 닫는다. 닫지 않으면 그 시간이 bad_posture_seconds에서 빠진다.
		// 같은 호출에서 "나쁘게 읽힌 초"도 받아 온다 — 판정 이력을 버리기 전에만 알 수 있는 값이다.
		int measuredBadSeconds = postureAnalysisService.finish(studyRecordId);
		replaceEvents(studyRecordId, request);

		int badPostureSeconds = badPostureSeconds(studyRecordId, measuredBadSeconds);
		int warningCount = (int) eventRepository.countWarnings(studyRecordId);

		// 감지 대상은 detail로 구분한다(부위만으로는 어깨 계열이 갈리지 않는다). 점수는 건수가 아니라 시간으로 계산한다.
		long forwardHeadSeconds = eventRepository.sumPostureSecondsByDetail(studyRecordId,
				PostureType.FORWARD_HEAD.detail());
		long shoulderTiltSeconds = eventRepository.sumPostureSecondsByDetail(studyRecordId,
				PostureType.SHOULDER_TILT.detail());
		long chinRestSeconds = eventRepository.sumPostureSecondsByDetail(studyRecordId,
				PostureType.CHIN_REST.detail());
		int stretchingAttempts = (int) eventRepository.countStretchingAttempts(studyRecordId);
		int stretchingCompleted = (int) eventRepository.countStretchingCompleted(studyRecordId);

		int focused = record.getFocusedSeconds();
		int total = record.getTotalStudySeconds();

		// bad_posture_seconds는 스키마상 total_study_seconds를 넘을 수 없다.
		// 서버가 감지한 나쁜 자세 시간이 클라이언트가 보고한 공부 시간보다 길면 total로 잘라 제약 위반(500)을 막는다.
		//
		// 다만 값만 조용히 맞추고 넘어가면 안 된다. 나쁜 자세가 공부한 시간보다 길다는 것은 측정이 어긋났다는 뜻이고(측정이 멈춘 구간까지
		// 이벤트가 열려 있었거나, 클라이언트가 보고한 시간이 실제 측정 구간보다 짧거나), 그대로 두면 자세 유지율이 0%로 저장된다.
		// 사용자가 화면을 보고 이상하다고 말해 주기 전에는 아무도 모르는 상태가 되므로 흔적을 남긴다.
		if (badPostureSeconds > total) {
			log.warn("나쁜 자세 시간이 총 학습 시간을 넘었습니다. record={}, badPosture={}초, total={}초, focused={}초, endReason={}",
					studyRecordId, badPostureSeconds, total, focused, record.getEndReason());
		}
		badPostureSeconds = Math.min(badPostureSeconds, total);

		// 0으로 나누는 것을 막기 위해 시간이 0인 경우를 먼저 걸러낸다.
		BigDecimal goodPostureRatio = focused > 0 ? percent(focused - badPostureSeconds, focused) : HUNDRED;
		// 학습 집중률 = 순공부 ÷ (순공부+자리비움). 마이페이지(MyPageService.attendanceRate)와 같은 정의다.
		// 총시간(순공+휴식+자리비움)으로 나누면 방이 정한 휴식을 지킬수록 점수가 깎인다 — 휴식이 실제로
		// 집계되기 시작한 뒤(2026-08-04) 드러난 왜곡이라 분모에서 휴식을 뺀다.
		int presentSeconds = focused + record.getAwaySeconds();
		BigDecimal focusScore = presentSeconds > 0 ? percent(focused, presentSeconds) : zero();
		BigDecimal neckScore = partScore(forwardHeadSeconds, focused);
		// 턱 괴기는 라운드숄더가 빠진 자리를 그대로 이어받는다.
		// 거북목 점수에 합치지 않는 이유: 둘이 섞이면 목이 나쁜 건지 손버릇인지 리포트에서 구분되지 않는다.
		BigDecimal chinRestScore = partScore(chinRestSeconds, focused);
		BigDecimal shoulderTiltScore = partScore(shoulderTiltSeconds, focused);
		// 종합 = 부위 3점수 평균. 집중 점수를 섞지 않는다 — "자세 종합"에 휴식·자리비움이 끼면
		// 자세가 좋아도 점수가 내려가 무엇을 말하는 값인지 알 수 없게 된다(집중은 focusScore가 따로 말한다).
		BigDecimal totalScore = average(neckScore, chinRestScore, shoulderTiltScore);

		record.applyScores(badPostureSeconds, warningCount, stretchingAttempts, stretchingCompleted, goodPostureRatio,
				focusScore, neckScore, chinRestScore, shoulderTiltScore, totalScore);
		return EndResponse.from(record);
	}

	/**
	 * 접속이 끊겨 돌아오지 않은 세션을 서버가 대신 종료한다.
	 *
	 * <p>
	 * 창을 닫거나 브라우저가 죽으면 종료 요청이 오지 않아 점수가 계산되지 않은 채 남는다. 나가기 버튼을 누른 것과 같은 결과가 되도록,
	 * 마지막으로 동기화된 시간(progress)을 그대로 확정값으로 삼아 마무리한다.
	 *
	 * <p>
	 * 자세·졸음 이벤트는 서버가 실시간 판정으로 이미 저장해 둔 것을 그대로 쓴다(교체하지 않는다). 이미 종료된 세션이면 아무것도 하지
	 * 않는다.
	 */
	@Transactional
	public void endByDisconnect(Long studyRecordId) {
		endWithStoredProgress(studyRecordId, "DISCONNECTED");
	}

	/**
	 * 서버 재시작으로 접속이 끊긴 것이 확정된 세션을 마무리한다.
	 *
	 * <p>
	 * 서버가 없는 동안 WebSocket이 유지될 수 없으므로, 재시작 시점에 방에 남아 있는 것으로 기록된 사람은 이미 끊긴 것이다.
	 * 이탈과 같은 경로로 처리해 점수까지 계산해 둔다 — 사유만 구분해 나중에 원인을 알 수 있게 한다.
	 */
	@Transactional
	public void endByServerRestart(Long studyRecordId) {
		endWithStoredProgress(studyRecordId, "SERVER_RESTART");
	}

	/**
	 * 나가기 버튼으로 퇴장할 때 세션을 마무리한다.
	 *
	 * <p>
	 * 프론트가 종료 API를 먼저 불렀으면 사유가 이미 남아 있으므로 아무것도 하지 않는다. 부르지 않았거나 실패했으면 여기서 마지막
	 * progress 값으로 확정한다. 이탈 경로는 서버가 알아서 점수를 계산하는데 나가기 경로만 클라이언트 호출에 의존하면, 그 호출이
	 * 빠지는 순간 점수 없는 기록이 남는다(결정 8 — 나가기 버튼과 같은 결과가 되어야 한다).
	 */
	@Transactional
	public void endByUserExit(Long studyRecordId) {
		endWithStoredProgress(studyRecordId, "USER_EXIT");
	}

	/** 클라이언트가 보내던 값 대신, 30초마다 저장돼 있던 누적 시간을 그대로 확정값으로 삼아 마무리한다. */
	private void endWithStoredProgress(Long studyRecordId, String endReason) {
		StudyRecord record = findOrThrow(studyRecordId);
		if (record.getEndReason() != null) {
			return; // 나가기 버튼으로 이미 종료됐다.
		}
		// 자세 목록을 null로 넘긴다 — 세션 중 실시간으로 저장된 이벤트를 그대로 집계하라는 뜻이다.
		// 빈 배열을 넘기면 그 이벤트가 전부 삭제된다(replaceEvents 주석 참고).
		EndRequest request = new EndRequest(record.getFocusedSeconds(), record.getBreakSeconds(),
				record.getAwaySeconds(), endReason, null);
		end(studyRecordId, record.getMemberId(), request);
	}

	@Transactional(readOnly = true)
	public StudyRecordDetailResponse getDetail(Long studyRecordId, Long memberId) {
		return StudyRecordDetailResponse.from(findOwnedOrThrow(studyRecordId, memberId));
	}

	/**
	 * 홈 화면 상단에 쓸 개인 학습 요약. 오늘·이번 주·지난주·연속 학습일수를 한 번에 만든다.
	 *
	 * <p>
	 * 주의 시작은 월요일이다. 날짜 경계는 서버 기본 시간대를 따르며 배포 환경은 Asia/Seoul로 맞춰져 있다. studyDate도 같은
	 * 기준으로 저장되므로, 여기서만 시간대를 따로 지정하면 오히려 어긋난다.
	 */
	@Transactional(readOnly = true)
	public StudySummaryResponse getSummary(Long memberId) {
		LocalDate today = LocalDate.now();
		LocalDate thisWeekStart = today.with(DayOfWeek.MONDAY);

		int todaySeconds = sumFocusedBetween(memberId, today, today.plusDays(1));
		int thisWeek = sumFocusedBetween(memberId, thisWeekStart, thisWeekStart.plusWeeks(1));
		int lastWeek = sumFocusedBetween(memberId, thisWeekStart.minusWeeks(1), thisWeekStart);
		int streak = countStreakDays(memberId, today);

		return StudySummaryResponse.of(todaySeconds, thisWeekStart, thisWeek, lastWeek, streak);
	}

	/** 지금 스터디룸에 있는 인원. 비로그인 홈에 보이는 값이라 인증 없이 호출된다. */
	@Transactional(readOnly = true)
	public ActiveUsersResponse getActiveUsers() {
		return new ActiveUsersResponse(studyRecordRepository.countStudyingMembers());
	}

	/** [from, to) 구간의 집중 시간 합. 끝을 미포함으로 두어 구간끼리 겹치지 않게 한다. */
	private int sumFocusedBetween(Long memberId, LocalDate from, LocalDate to) {
		return studyRecordRepository.sumFocusedSecondsByMemberAndPeriod(memberId, from, to);
	}

	/**
	 * 연속 학습일수. 오늘(또는 오늘 기록이 없으면 어제)부터 하루도 빠지지 않고 이어진 날을 센다.
	 *
	 * <p>
	 * 오늘 아직 공부하지 않았다고 해서 0으로 떨어뜨리지 않는다. 아침에 홈을 열었을 때 어제까지 쌓아 둔 기록이 사라진 것처럼
	 * 보이면, 실제로는 연속이 끊기지 않았는데도 끊긴 것으로 오해하게 된다.
	 *
	 * <p>
	 * 탐색 범위를 STREAK_LOOKBACK_DAYS로 제한한다. 그보다 긴 연속 기록은 현실적으로 나오지 않고, 없으면 회원의 전체
	 * 기록을 매번 읽게 된다.
	 */
	private int countStreakDays(Long memberId, LocalDate today) {
		Set<LocalDate> studiedDays = Set
				.copyOf(studyRecordRepository.findStudiedDatesSince(memberId, today.minusDays(STREAK_LOOKBACK_DAYS)));

		if (studiedDays.isEmpty()) {
			return 0;
		}

		// 오늘 기록이 없으면 어제부터 센다(오늘은 아직 안 한 것일 뿐 끊긴 게 아니다).
		LocalDate cursor = studiedDays.contains(today) ? today : today.minusDays(1);
		int streak = 0;
		while (studiedDays.contains(cursor)) {
			streak++;
			cursor = cursor.minusDays(1);
		}
		return streak;
	}

	private StudyRecord findOrThrow(Long studyRecordId) {
		return studyRecordRepository.findById(studyRecordId).orElseThrow(
				() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "스터디 기록(세션)을 찾을 수 없습니다: " + studyRecordId));
	}

	private StudyRecord findOwnedOrThrow(Long studyRecordId, Long memberId) {
		StudyRecord record = findOrThrow(studyRecordId);
		if (!record.getMemberId().equals(memberId)) {
			throw new ResponseStatusException(HttpStatus.FORBIDDEN, "본인의 스터디 기록만 접근할 수 있습니다.");
		}
		return record;
	}

	/**
	 * 종료 요청에 담긴 자세 이벤트를 DB 이벤트로 교체 저장한다. 서버 판정을 쓰지 않는 환경 전용 경로다.
	 *
	 * <p>
	 * 클라이언트의 판정 모델이 보낸 postureType으로 (부위, detail)을 정한다. 부위만으로는 종류가 구분되지 않기 때문이다.
	 * 네트워크 문제로 end가 재호출되어도 중복 집계되지 않도록 먼저 기존 이벤트를 지운다.
	 *
	 * <p>
	 * <b>지운다는 것이 이 메서드의 위험한 부분이다.</b> 요청에 목록이 담겨 있으면 세션의 POSTURE 이벤트가 전부 삭제되고 그
	 * 목록으로 교체된다 — 빈 배열([])이면 "전부 지워라"가 된다. 서버가 실시간으로 저장한 거북목·어깨는 물론, 브라우저가
	 * posture-checks로 그때그때 보낸 턱 괴기까지 사라지는데 응답은 200이다.
	 *
	 * <p>
	 * 그래서 담기지 않은(null) 경우에는 아무것도 건드리지 않는다. 평소 경로가 그쪽이다. 졸음·휴대폰이 이 메서드에서 빠진 것도 같은
	 * 이유다 — 실시간 입구가 생기면서 목록으로 받을 일이 없어졌고, 필드를 남겨 두면 같은 사고가 나므로
	 * {@link EndRequest}에서 아예 제거했다.
	 */
	private void replaceEvents(Long studyRecordId, EndRequest request) {
		// 목록을 보내지 않았으면 아무것도 건드리지 않는다. 평소 경로가 여기다 — 자세는 서버가 실시간으로
		// 판정해 저장하고, 졸음·휴대폰은 각자의 실시간 입구(DistractionCheckService)가 저장해 둔다.
		if (request.postureEvents() == null) {
			return;
		}
		eventRepository.deleteByStudyRecordIdAndEventTypeIn(studyRecordId, List.of("POSTURE"));

		List<Event> events = new ArrayList<>();
		for (PostureCheckRequest event : request.postureEvents()) {
			// 종료 시각이 시작 시각보다 빠르면 events의 시간 순서 제약(started_at <= ended_at)에 걸려 저장이 실패한다.
			// DB까지 가기 전에 400으로 걸러낸다.
			if (event.endedAt() != null && event.endedAt().isBefore(event.startedAt())) {
				throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "자세 이벤트의 종료 시각은 시작 시각보다 빠를 수 없습니다.");
			}
			PostureType type = parsePostureType(event.postureType());
			events.add(Event.postureDetected(studyRecordId, type.bodyPart(), type.detail(), event.deviationDegrees(),
					event.alertChannel(), event.severity(), event.startedAt(), event.endedAt(), event.durationSeconds(),
					event.captureUrl(), null));
		}
		eventRepository.saveAll(events);
	}

	/**
	 * 이 세션의 나쁜 자세 초. 점수와 바른 자세 유지 비율의 근거값이다.
	 *
	 * <p>
	 * 두 가지 근거가 있고 서로를 채워 준다. 둘 다 세션 전체를 덮지 못하므로 큰 쪽을 쓴다.
	 *
	 * <ul>
	 * <li><b>판정기가 나쁘다고 읽은 초</b>(measuredBadSeconds) — 서버가 판정하는 거북목·어깨만 해당한다. 확정과
	 * 무관하게 세므로 30초 확정에 못 미친 짧은 흐트러짐까지 잡힌다(이벤트만 보면 그런 패턴은 한 건도 안 남아, 타임랩스에는
	 * 나쁜 구간이 빨갛게 찍혔는데 결과 화면은 100%가 되는 모순이 있었다). 메모리에 있어 서버 재시작으로 사라질 수 있다.
	 * <li><b>이벤트 구간의 합집합</b> — 30초 확정된 것만 남지만, 브라우저가 판정해 보내는 턱 괴기가 여기에만 있다.
	 * 겹친 구간은 합쳐서 센다({@link PostureInterval#mergedSeconds}) — 거북목인 채로 턱을 괴면 두 이벤트가 같은
	 * 시간대에 열리는데, 길이를 그냥 더하면 그 시간이 두 번 세어진다.
	 * </ul>
	 *
	 * <p>
	 * 한계: 두 값을 더하지 않고 큰 쪽만 쓴다. 측정 초와 이벤트 구간은 같은 시간대를 서로 다른 눈금으로 잰 값이라 더하면
	 * 겹친 만큼 부푼다. 그래서 이 값은 실제보다 <b>작을 수</b> 있다 — 두 근거가 서로 못 보는 시간이 겹치지 않은 만큼.
	 */
	private int badPostureSeconds(Long studyRecordId, int measuredBadSeconds) {
		int eventSeconds = PostureInterval.mergedSeconds(eventRepository.findPostureIntervals(studyRecordId));
		return Math.max(measuredBadSeconds, eventSeconds);
	}

	/** 클라이언트가 보낸 자세 종류 문자열을 PostureType으로 바꾼다. 알 수 없는 값이면 400. */
	private PostureType parsePostureType(String value) {
		try {
			return PostureType.valueOf(value);
		} catch (IllegalArgumentException | NullPointerException e) {
			throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "알 수 없는 자세 종류입니다: " + value);
		}
	}

	// ── 점수 계산 (모두 0~100, 소수 2자리) ──

	private BigDecimal percent(int part, int whole) {
		return clamp(
				BigDecimal.valueOf(part).multiply(HUNDRED).divide(BigDecimal.valueOf(whole), 2, RoundingMode.HALF_UP));
	}

	/**
	 * 부위 점수 = 100 × (1 − 그 자세였던 시간 ÷ 순공부 시간).
	 *
	 * <p>
	 * "공부한 시간 중 그 자세로 있던 비율"이라 세션 길이에 공정하고 사용자에게 설명 가능하다.
	 * 순공부가 0이면 측정 자체가 없던 세션이라 goodPostureRatio의 기본값 규칙(100)과 맞춘다 —
	 * 주간 집계는 순공부 0인 세션을 걸러내므로 이 기본값이 통계를 오염시키지 않는다.
	 */
	private BigDecimal partScore(long badSeconds, int focusedSeconds) {
		if (focusedSeconds <= 0) {
			return HUNDRED;
		}
		int capped = (int) Math.min(badSeconds, focusedSeconds);
		return percent(focusedSeconds - capped, focusedSeconds);
	}

	private BigDecimal average(BigDecimal... values) {
		BigDecimal sum = BigDecimal.ZERO;
		for (BigDecimal v : values) {
			sum = sum.add(v);
		}
		return clamp(sum.divide(BigDecimal.valueOf(values.length), 2, RoundingMode.HALF_UP));
	}

	/** 스키마에 0~100 제약이 있어 범위를 벗어난 값은 잘라낸다(감지 이벤트가 많으면 음수가 될 수 있다). */
	private BigDecimal clamp(BigDecimal value) {
		BigDecimal v = value.setScale(2, RoundingMode.HALF_UP);
		if (v.compareTo(BigDecimal.ZERO) < 0) {
			return zero();
		}
		if (v.compareTo(HUNDRED) > 0) {
			return HUNDRED;
		}
		return v;
	}

	private BigDecimal zero() {
		return new BigDecimal("0.00");
	}
}
