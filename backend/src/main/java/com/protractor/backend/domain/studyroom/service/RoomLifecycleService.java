package com.protractor.backend.domain.studyroom.service;

import com.protractor.backend.domain.studyrecord.entity.StudyRecord;
import com.protractor.backend.domain.studyrecord.repository.StudyRecordRepository;
import com.protractor.backend.domain.studyrecord.service.StudyRecordService;
import com.protractor.backend.domain.studyroom.entity.StudyRoom;
import com.protractor.backend.domain.studyroom.repository.StudyRoomRepository;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Set;
import java.util.stream.Collectors;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 방을 실제로 지우고, 서버가 죽어 있던 동안 어긋난 상태를 되돌린다.
 *
 * <p>
 * 방 상태는 인원 수에서 파생되고(설계 결정 9-1), 인원의 정본은 {@code study_records.left_at IS NULL}이다.
 * 그런데 접속 여부는 서버 메모리에만 있어서, 재시작하면 "방에 있다"고 기록된 사람들을 정리할 주체가 사라진다. 그 상태를 방치하면
 * 정원이 유령으로 차고, 접속자 수와 방 목록이 실제와 어긋난다.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class RoomLifecycleService {

	private final StudyRoomRepository studyRoomRepository;
	private final StudyRecordRepository studyRecordRepository;
	private final StudyRecordService studyRecordService;

	/**
	 * 만료된 방을 소프트 삭제한다.
	 *
	 * <p>
	 * 만료 시각이 붙는 경우는 둘이다 — 개설만 하고 입장하지 않은 방(WAITING)과 사람이 모두 나간 방(ENDED). 사람이
	 * 들어와 있는 방은 입장 시점에 만료가 해제되므로 대상이 아니다.
	 */
	@Scheduled(fixedRate = RoomLifecyclePolicy.EXPIRY_SWEEP_INTERVAL_MS)
	@Transactional
	public void deleteExpiredRooms() {
		List<StudyRoom> expired = studyRoomRepository.findByExpiresAtBefore(LocalDateTime.now());
		if (expired.isEmpty()) {
			return;
		}
		// 변경 감지로 커밋 시 UPDATE된다.
		expired.forEach(StudyRoom::softDelete);
		log.info("만료된 방 {}개를 정리했습니다. rooms={}", expired.size(),
				expired.stream().map(StudyRoom::getId).toList());
	}

	/**
	 * 서버가 죽어 있던 동안 남은 유령 참여자를 정리한다.
	 *
	 * <p>
	 * 서버가 없는 동안 WebSocket이 유지될 수는 없다. 그러므로 시작 시점에 "방에 있다"고 기록된 사람은 이미 끊긴 것이
	 * 확정이다. 이탈과 같은 경로로 세션을 마무리해(점수 계산 포함) 사유만 SERVER_RESTART로 남긴다.
	 *
	 * <p>
	 * 사람이 없어진 방은 종료(ENDED) 상태로 내리고 짧은 만료를 심는다. 곧바로 지우지 않는 이유는 재시작 직후 사용자가 새로고침해
	 * 돌아올 수 있기 때문이다. 돌아오지 않으면 위 스케줄러가 지운다.
	 */
	@EventListener(ApplicationReadyEvent.class)
	@Transactional
	public void cleanUpGhostParticipants() {
		List<StudyRecord> ghosts = studyRecordRepository.findByLeftAtIsNull();
		if (ghosts.isEmpty()) {
			return;
		}

		Set<Long> affectedRoomIds = ghosts.stream().map(StudyRecord::getStudyRoomId).collect(Collectors.toSet());
		// 한 건이 실패해도 나머지 정리를 막지 않는다. 정리 작업이라 부분 성공이 전부 실패보다 낫다.
		for (StudyRecord ghost : ghosts) {
			try {
				studyRecordService.endByServerRestart(ghost.getId());
			} catch (Exception e) {
				log.warn("유령 참여 기록 정리 실패 record={} ({})", ghost.getId(), e.getMessage());
			}
		}

		List<StudyRoom> rooms = studyRoomRepository.findAllById(affectedRoomIds);
		rooms.forEach(room -> room.endSession(RoomLifecyclePolicy.END_REASON_SERVER_RESTART,
				RoomLifecyclePolicy.ENDED_TTL));

		log.info("서버 재시작 정리: 유령 참여 기록 {}건을 종료하고 방 {}개를 ENDED로 내렸습니다. rooms={}", ghosts.size(),
				rooms.size(), affectedRoomIds);
	}
}
