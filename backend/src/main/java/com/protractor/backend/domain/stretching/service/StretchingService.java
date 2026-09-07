package com.protractor.backend.domain.stretching.service;

import java.time.LocalDateTime;
import java.time.temporal.ChronoUnit;
import java.util.List;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import com.protractor.backend.domain.stretching.dto.StretchingCompleteRequest;
import com.protractor.backend.domain.stretching.dto.StretchingEventResponse;
import com.protractor.backend.domain.stretching.dto.StretchingResponse;
import com.protractor.backend.domain.stretching.dto.StretchingSkipRequest;
import com.protractor.backend.domain.stretching.dto.StretchingStartRequest;
import com.protractor.backend.domain.stretching.entity.Stretching;
import com.protractor.backend.domain.stretching.repository.StretchingRepository;
import com.protractor.backend.domain.studyrecord.entity.Event;
import com.protractor.backend.domain.studyrecord.repository.EventRepository;
import com.protractor.backend.domain.studyrecord.repository.StudyRecordRepository;

import lombok.RequiredArgsConstructor;

// 스트레칭 관련 로직을 담당할 파일이다.
// Controller가 직접 DB를 보면 코드가 지저분해진다.
// 그래서 중간에 Service를 둔다.

@Service
// 생성자 어노테이션을 붙인다.
@RequiredArgsConstructor

public class StretchingService {

	private final StretchingRepository stretchingRepository;
	private final StudyRecordRepository studyRecordRepository;
	private final EventRepository eventRepository;

	// 조회 전용 트랜잭션을 붙인다. readOnly는 조회만 한다는 뜻이다.
	@Transactional(readOnly = true)
	public List<StretchingResponse> getList() {
		// Stretching 하나를 StretchingResponse 하나로 바꿔라
		return stretchingRepository.findByEnabledTrueOrderBySortOrderAscIdAsc().stream().map(StretchingResponse::from)
				.toList();
	}

	@Transactional
	public StretchingEventResponse start(Long memberId, Long studyRecordId, Long stretchingId,
			StretchingStartRequest request) {
		validateOwnedStudyRecord(studyRecordId, memberId);
		validateEnabledStretching(stretchingId);

		// events.started_at은 DATETIME(초 단위)이라 밀리초가 반올림된다. 초 단위로 내려 저장 값과 어긋나지 않게 한다.
		LocalDateTime startedAt = (request != null && request.startedAt() != null ? request.startedAt()
				: LocalDateTime.now()).truncatedTo(ChronoUnit.SECONDS);
		Event event = eventRepository.save(Event.stretchingStarted(studyRecordId, stretchingId, startedAt));
		return StretchingEventResponse.from(event);
	}

	@Transactional
	public StretchingEventResponse complete(Long memberId, Long eventId, StretchingCompleteRequest request) {
		Event event = findStretchingEventOrThrow(eventId);
		validateOwnedStudyRecord(event.getStudyRecordId(), memberId);
		if (!"STARTED".equals(event.getDetail())) {
			throw new ResponseStatusException(HttpStatus.CONFLICT, "시작 상태의 스트레칭 이벤트만 완료할 수 있습니다: " + eventId);
		}

		LocalDateTime completedAt = (request.completedAt() != null ? request.completedAt() : LocalDateTime.now())
				.truncatedTo(ChronoUnit.SECONDS);
		// 종료 시각이 시작 시각보다 빠르면 events의 시간 순서 제약(started_at <= ended_at)에 걸려 저장이 실패한다.
		if (event.getStartedAt() != null && completedAt.isBefore(event.getStartedAt())) {
			throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "완료 시각은 시작 시각보다 빠를 수 없습니다.");
		}
		event.completeStretching(request.completionRate(), completedAt);
		return StretchingEventResponse.from(event);
	}

	@Transactional
	public StretchingEventResponse skip(Long memberId, Long studyRecordId, Long stretchingId,
			StretchingSkipRequest request) {
		validateOwnedStudyRecord(studyRecordId, memberId);
		validateEnabledStretching(stretchingId);

		LocalDateTime skippedAt = (request != null && request.skippedAt() != null ? request.skippedAt()
				: LocalDateTime.now()).truncatedTo(ChronoUnit.SECONDS);
		String reason = request != null ? request.reason() : null;

		// 이미 시작을 알린 건이 있으면 새로 만들지 않고 그 행을 닫는다.
		//
		// 새로 만들면 한 번의 스트레칭이 두 행(STARTED + SKIPPED)이 되어 시도 횟수가 두 배로 잡힌다
		// (countStretchingAttempts 는 STRETCHING 행 수를 그대로 센다). 시작 시각도 그 행에 남아 있어
		// 재사용하면 "얼마나 붙들고 있다가 건너뛰었는지"가 duration_seconds 에 그대로 기록된다.
		//
		// 시작을 알리지 않고 바로 건너뛰는 경우도 있으므로 없으면 만든다.
		Event event = eventRepository
				.findFirstByStudyRecordIdAndStretchingIdAndDetailOrderByIdDesc(studyRecordId, stretchingId, "STARTED")
				.orElseGet(() -> eventRepository.save(Event.stretchingStarted(studyRecordId, stretchingId, skippedAt)));
		event.skipStretching(reason, skippedAt);
		return StretchingEventResponse.from(event);
	}

	private void validateOwnedStudyRecord(Long studyRecordId, Long memberId) {
		studyRecordRepository.findById(studyRecordId).map(record -> {
			if (!record.getMemberId().equals(memberId)) {
				throw new ResponseStatusException(HttpStatus.FORBIDDEN, "본인의 스터디 기록만 접근할 수 있습니다.");
			}
			return record;
		}).orElseThrow(
				() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "스터디 기록(세션)을 찾을 수 없습니다: " + studyRecordId));
	}

	private Stretching validateEnabledStretching(Long stretchingId) {
		Stretching stretching = stretchingRepository.findById(stretchingId)
				.orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "스트레칭을 찾을 수 없습니다: " + stretchingId));
		if (!stretching.isEnabled()) {
			throw new ResponseStatusException(HttpStatus.NOT_FOUND, "사용할 수 없는 스트레칭입니다: " + stretchingId);
		}
		return stretching;
	}

	private Event findStretchingEventOrThrow(Long eventId) {
		Event event = eventRepository.findById(eventId)
				.orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "스트레칭 이벤트를 찾을 수 없습니다: " + eventId));
		if (!event.isStretching()) {
			throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "스트레칭 이벤트가 아닙니다: " + eventId);
		}
		return event;
	}
}
