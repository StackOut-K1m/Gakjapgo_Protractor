package com.protractor.backend.domain.studyrecord.service;

import com.protractor.backend.domain.studyrecord.dto.DistractionCheckResponse;
import com.protractor.backend.domain.studyrecord.dto.DrowsinessCheckRequest;
import com.protractor.backend.domain.studyrecord.dto.PhoneCheckRequest;
import com.protractor.backend.domain.studyrecord.entity.Event;
import com.protractor.backend.domain.studyrecord.repository.EventRepository;
import com.protractor.backend.domain.studyrecord.repository.StudyRecordRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

/**
 * 브라우저가 확정한 집중 방해 이벤트(졸음·휴대폰)를 발생 즉시 저장한다.
 *
 * <p>
 * 예전에는 브라우저가 세션 내내 메모리에 모아 두고 종료 요청에 실어 보냈다. 그러면 창이 강제로 닫히거나 브라우저가 죽는 순간 그
 * 세션의 졸음·휴대폰 기록이 통째로 사라진다. 자세는 확정될 때마다 서버에 남는데 이 두 종류만 그렇지 않았다.
 *
 * <p>
 * 그래서 자세와 같은 방식으로 바꿨다 — 감지가 확정되는 순간 한 건씩 저장한다. 판정은 여전히 브라우저가 한다(졸음은 개인별 EAR
 * 기준선이, 휴대폰은 YOLO 추론이 필요해 서버 1Hz 표본으로는 못 한다). 이 서비스는 받은 값을 그대로 남기는 일만 한다.
 *
 * <p>
 * 자세의 {@code PostureCheckService}와 형태가 같지만 합치지 않았다. 그쪽은 {@code eventType}이 POSTURE가
 * 아니면 400을 던져 자세 전용임을 못박고 있고, 집계 쿼리도 event_type으로 갈린다. 한 입구에서 다 받으면 그 구분이 흐려진다.
 */
@Service
@RequiredArgsConstructor
public class DistractionCheckService {

	private final StudyRecordRepository studyRecordRepository;
	private final EventRepository eventRepository;

	/**
	 * 졸음 한 건. 눈이 감긴 채로 지속 시간을 채운 순간에 온다.
	 *
	 * <p>
	 * 시점 이벤트라 구간이 없다 — {@code ended_at}과 {@code duration_seconds}를 채우지 않는다. level은
	 * events.severity로 저장되며, 스키마 제약이 1~5이므로 DTO에서 범위를 먼저 막는다.
	 */
	@Transactional
	public DistractionCheckResponse recordDrowsiness(Long sessionId, Long memberId, DrowsinessCheckRequest request) {
		requireOwnedSession(sessionId, memberId);
		Event event = Event.drowsy(sessionId, request.level(), request.detectedAt());
		return DistractionCheckResponse.from(eventRepository.save(event));
	}

	/**
	 * 휴대폰 사용 한 구간. 화면에서 폰이 사라져 구간이 닫힌 순간에 온다.
	 *
	 * <p>
	 * 구간을 열 때가 아니라 닫을 때 한 번만 받는다(턱 괴기와 같은 방식). 열어 두고 나중에 닫는 방식이면 비정상 종료 때 미완성
	 * 행이 남는데, 그것을 닫아 주는 곳이 자세 전용({@code PostureAnalysisService.finish})이라 휴대폰까지
	 * 손봐야 한다. 잃는 것은 진행 중인 한 건뿐이라 단순한 쪽을 골랐다.
	 */
	@Transactional
	public DistractionCheckResponse recordPhone(Long sessionId, Long memberId, PhoneCheckRequest request) {
		requireOwnedSession(sessionId, memberId);
		// events의 시간 순서 제약(started_at <= ended_at)에 걸리기 전에 400으로 걸러낸다.
		if (request.endedAt() != null && request.endedAt().isBefore(request.startedAt())) {
			throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "휴대폰 사용 종료 시각이 시작 시각보다 앞설 수 없습니다.");
		}
		Event event = Event.phoneUsed(sessionId, request.startedAt(), request.endedAt(), request.durationSeconds());
		return DistractionCheckResponse.from(eventRepository.save(event));
	}

	/**
	 * 내 세션인지 확인한다.
	 *
	 * <p>
	 * 없는 세션과 남의 세션을 같은 404로 답한다. 구분해서 알려 주면 sessionId를 훑어 어느 번호가 실재하는지 알아낼 수 있다.
	 */
	private void requireOwnedSession(Long sessionId, Long memberId) {
		if (!studyRecordRepository.existsByIdAndMemberId(sessionId, memberId)) {
			throw new ResponseStatusException(HttpStatus.NOT_FOUND, "스터디 세션을 찾을 수 없습니다: " + sessionId);
		}
	}
}
