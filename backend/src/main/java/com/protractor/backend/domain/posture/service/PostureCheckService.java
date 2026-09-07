package com.protractor.backend.domain.posture.service;

import com.protractor.backend.domain.posture.dto.PostureCheckRequest;
import com.protractor.backend.domain.posture.dto.PostureCheckResponse;
import com.protractor.backend.domain.studyrecord.entity.Event;
import com.protractor.backend.domain.studyrecord.repository.EventRepository;
import com.protractor.backend.domain.studyrecord.repository.StudyRecordRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

/**
 * 클라이언트가 확정한 자세 이벤트를 저장한다.
 *
 * <p>
 * 판정을 하지 않으므로 캘리브레이션 기준선도 30초 윈도우도 쓰지 않는다. 받은 값을 그대로 남기고, 판정 근거(metadata)는 비워 둔다.
 * 서버가 판정한 이벤트와 구분해야 나중에 정확도를 비교할 때 두 출처를 섞지 않을 수 있다.
 */
@Service
@RequiredArgsConstructor
public class PostureCheckService {

	private static final String POSTURE = "POSTURE";

	private final StudyRecordRepository studyRecordRepository;
	private final EventRepository eventRepository;

	@Transactional
	public PostureCheckResponse record(Long sessionId, PostureCheckRequest request) {
		// 이 입구는 자세 전용이다. 졸음은 drowsiness-checks로 가야 집계 쿼리가 갈리지 않는다.
		if (!POSTURE.equalsIgnoreCase(request.eventType())) {
			throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
					"자세 체크는 eventType이 POSTURE여야 합니다: " + request.eventType());
		}
		// events.study_record_id는 FK라 없는 세션이면 DB가 막는다. 먼저 확인해 원인이 드러나는 오류를 낸다.
		if (!studyRecordRepository.existsById(sessionId)) {
			throw new ResponseStatusException(HttpStatus.NOT_FOUND, "스터디 세션을 찾을 수 없습니다: " + sessionId);
		}
		if (request.endedAt() != null && request.endedAt().isBefore(request.startedAt())) {
			throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "해소 시각이 시작 시각보다 앞설 수 없습니다");
		}

		Event event = Event.postureDetected(sessionId, request.bodyPart(), request.detail(), request.deviationDegrees(),
				request.alertChannel(), request.severity(), request.startedAt(), request.endedAt(),
				request.durationSeconds(), request.captureUrl(), null);
		return PostureCheckResponse.from(eventRepository.save(event));
	}
}
