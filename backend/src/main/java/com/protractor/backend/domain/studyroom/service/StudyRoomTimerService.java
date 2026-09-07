package com.protractor.backend.domain.studyroom.service;

import com.protractor.backend.domain.studyroom.dto.TimerPhaseResponse;
import com.protractor.backend.domain.studyroom.dto.TimerStateResponse;
import com.protractor.backend.domain.studyroom.entity.StudyRoom;
import com.protractor.backend.domain.studyroom.entity.StudyRoomPhaseRecord;
import com.protractor.backend.domain.studyroom.repository.StudyRoomPhaseRecordRepository;
import com.protractor.backend.domain.studyroom.repository.StudyRoomRepository;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDateTime;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

/**
 * 방 타이머(집중↔휴식 사이클) 관리.
 *
 * <p>
 * 방장이 시작하면 서버가 각 방의 페이즈 남은 시간을 1초마다 확인하다가, 시간이 다 되면 다음 페이즈로 전환하고
 * {@code /topic/study-rooms/{roomId}/timer} 구독자 전원에게 알린다. 각 페이즈는
 * study_room_phase_records에 기록된다.
 *
 * <p>
 * 진행 상태는 메모리에 둔다(초 단위로 바뀌는 값을 매번 DB에 쓰지 않는다). 서버 재시작 시 진행 중 타이머는 사라진다 — 다중
 * 서버로 확장하면 Redis로 옮겨야 한다.
 */
@Service
@RequiredArgsConstructor
public class StudyRoomTimerService {

	private static final String FOCUS = "FOCUS";
	private static final String STRETCHING = "STRETCHING";
	private static final String BREAK = "BREAK";

	// 스트레칭 페이즈 길이(초) — 호환용으로만 남아 있다.
	//
	// 집중 → 스트레칭 → 휴식이던 사이클에서 스트레칭 구간을 뺐다(지금은 집중 ↔ 휴식). 그래서 새로 시작하는
	// 방은 이 값을 쓰지 않는다. 서버를 올리기 전부터 STRETCHING 구간을 돌고 있던 방이 남은 시간을 계산할 때만
	// durationOf가 이 값을 본다. 그런 방이 모두 끝나면 STRETCHING 상수와 함께 지워도 된다.
	private static final int STRETCH_SECONDS = 60;

	private final StudyRoomRepository studyRoomRepository;
	private final StudyRoomPhaseRecordRepository phaseRecordRepository;
	private final SimpMessagingTemplate messagingTemplate;

	// 방 id -> 진행 중인 타이머 상태
	private final Map<Long, TimerState> timers = new ConcurrentHashMap<>();

	/** 타이머 시작(방장만). 집중(FOCUS) 페이즈부터 시작하고, 방을 RUNNING으로 전환한다. */
	@Transactional
	public void start(Long roomId, Long memberId) {
		StudyRoom room = findHostRoomOrThrow(roomId, memberId);
		if (!startIfAbsent(room)) {
			throw new ResponseStatusException(HttpStatus.CONFLICT, "이미 타이머가 실행 중입니다.");
		}
	}

	/**
	 * 이미 도는 타이머가 없으면 시작한다. 시작했으면 true, 이미 돌고 있었으면 false.
	 *
	 * <p>
	 * 방장 입장 시 자동 시작에 쓴다. 프론트는 준비 화면의 입장 버튼과 스터디룸 진입에서 입장 API를 두 번 부르므로
	 * (멱등), 두 번째 호출이 타이머를 리셋하거나 409를 내면 안 된다. 그래서 예외 대신 결과를 돌려준다.
	 */
	@Transactional
	public boolean startIfAbsent(StudyRoom room) {
		Long roomId = room.getId();

		// (2) 재시작 시 sequence를 1로 되돌리면 (study_room_id, sequence) UNIQUE에 걸린다.
		// 그 방의 기존 최대 sequence 다음부터 이어간다.
		int startSequence = phaseRecordRepository.findMaxSequence(roomId) + 1;

		// (1) 동시 이중 start 방지: 슬롯을 먼저 원자적으로 선점한다.
		// 선점~초기화 사이에는 phaseEndsAt을 MAX로 둬 tick이 전환하지 않게 한다.
		TimerState state = new TimerState(FOCUS, startSequence, Instant.MAX, null, room.getFocusDurationSeconds(),
				room.getBreakDurationSeconds(), room.isStretchingEnabled());
		if (timers.putIfAbsent(roomId, state) != null) {
			return false;
		}

		// 선점 성공. 이제 첫 페이즈를 기록하고 실제 종료 시각을 채운다.
		LocalDateTime now = LocalDateTime.now();
		StudyRoomPhaseRecord record = phaseRecordRepository
				.save(StudyRoomPhaseRecord.start(roomId, FOCUS, startSequence, now));
		state.currentPhaseRecordId = record.getId();
		state.phaseEndsAt = Instant.now().plusSeconds(room.getFocusDurationSeconds());

		// 방을 진행중(RUNNING)으로 전환한다(변경 감지로 커밋 시 UPDATE).
		room.startSession();

		broadcast("STARTED", roomId, state);
		return true;
	}

	/**
	 * 타이머 정지(방장만). 진행 중이던 페이즈를 닫는다.
	 *
	 * <p>
	 * 방 상태는 건드리지 않는다. 사람이 남아 있는데도 방이 ENDED가 되면 "방 상태는 인원 수에서 파생된다"는 모델과 어긋난다
	 * (설계 결정 9-1). 방을 ENDED로 보내는 것은 마지막 사람이 나갈 때뿐이다.
	 */
	@Transactional
	public void stop(Long roomId, Long memberId) {
		findHostRoomOrThrow(roomId, memberId);
		if (!stopQuietly(roomId)) {
			throw new ResponseStatusException(HttpStatus.CONFLICT, "실행 중인 타이머가 없습니다.");
		}
	}

	/**
	 * 권한 확인 없이 타이머를 멈춘다. 멈출 것이 있었으면 true.
	 *
	 * <p>
	 * 마지막 사람이 나가 방이 비었을 때 쓴다. 그 시점에는 방장이 이미 없을 수 있어 방장 확인을 할 수 없고, 타이머가 없어도
	 * 퇴장 처리는 성공해야 하므로 예외를 던지지 않는다.
	 */
	public boolean stopQuietly(Long roomId) {
		TimerState state = timers.remove(roomId);
		if (state == null) {
			return false;
		}
		closePhaseRecord(state.currentPhaseRecordId);
		broadcast("STOPPED", roomId, state);
		return true;
	}

	/** 1초마다 모든 방의 타이머를 확인해 시간이 다 된 페이즈를 다음으로 넘긴다. */
	@Scheduled(fixedRate = 1000)
	public void tick() {
		Instant now = Instant.now();
		// 순회 중 stop으로 제거될 수 있어 키 복사본으로 돈다.
		for (Long roomId : timers.keySet().toArray(Long[]::new)) {
			TimerState state = timers.get(roomId);
			if (state != null && !now.isBefore(state.phaseEndsAt)) {
				transition(roomId, state);
			}
		}
	}

	/**
	 * 방장이 바꾼 학습·휴식 시간을 진행 중인 타이머에 반영한다.
	 *
	 * <p>
	 * <b>지금 도는 구간은 건드리지 않는다.</b> 집중 30분을 15분 남기고 10분으로 줄이면 이미 지난
	 * 시간이 남은 시간보다 길어져 구간이 그 자리에서 끝나 버린다. 반대로 늘리면 곧 끝날 줄 알고
	 * 있던 사람에게 시간이 갑자기 불어난다. 방 전원이 같은 화면을 보고 있어서 더 혼란스럽다.
	 *
	 * <p>
	 * 그래서 새 값은 <b>다음에 그 구간이 시작될 때</b> 적용된다. 집중 중에 집중 시간을 바꾸면
	 * 이번 집중은 그대로 끝나고 휴식을 지나 다음 집중부터 바뀌며, 집중 중에 휴식 시간을 바꾸면
	 * 바로 다음 휴식부터 바뀐다. 어느 쪽이든 "지금 보고 있는 카운트다운은 안 흔들린다"는 규칙은 같다.
	 *
	 * <p>
	 * 타이머가 돌고 있지 않으면 할 일이 없다 — 다음 시작 때 DB 에서 새 값을 읽는다.
	 */
	public void applySettings(Long roomId, Integer focusSeconds, Integer breakSeconds) {
		TimerState state = timers.get(roomId);
		if (state == null) {
			return;
		}
		if (focusSeconds != null) {
			state.focusSeconds = focusSeconds;
		}
		if (breakSeconds != null) {
			state.breakSeconds = breakSeconds;
		}
	}

	/** 현재 페이즈를 닫고 다음 페이즈(집중→스트레칭→휴식→집중)를 시작한다. */
	private void transition(Long roomId, TimerState state) {
		closePhaseRecord(state.currentPhaseRecordId);

		String nextPhase = nextPhase(state);
		int duration = durationOf(nextPhase, state);

		LocalDateTime now = LocalDateTime.now();
		int nextSequence = state.sequence + 1;
		StudyRoomPhaseRecord record = phaseRecordRepository
				.save(StudyRoomPhaseRecord.start(roomId, nextPhase, nextSequence, now));

		state.phase = nextPhase;
		state.sequence = nextSequence;
		state.phaseEndsAt = Instant.now().plusSeconds(duration);
		state.currentPhaseRecordId = record.getId();

		broadcast("PHASE_CHANGED", roomId, state);
	}

	/**
	 * 다음 페이즈 결정. 순서는 집중 → (휴식) → 집중.
	 *
	 * <p>
	 * 휴식은 휴식 시간이 0보다 클 때만 낀다. 없으면 집중을 반복한다.
	 *
	 * <p>
	 * <b>예전에는 집중과 휴식 사이에 STRETCHING 1분이 자동으로 끼었다.</b> 뺀 이유는 그 구간이
	 * 실제로 스트레칭을 시키지 않았기 때문이다 — 화면에는 휴식과 똑같이 '쉬는 시간'만 뜨고 1분이
	 * 흘렀다. 사용자에게는 쉬는 시간이 이유 없이 두 번 반복되는 것으로 보였다.
	 *
	 * <p>
	 * 스트레칭 기능 자체는 그대로다. 자세 경고가 부위별 임계치에 닿으면 그때 스트레칭 화면이
	 * 뜨는데(프론트의 detectCounts), 그건 이 타이머와 무관한 별개 경로다.
	 *
	 * <p>
	 * {@code stretchingEnabled} 는 지운 게 아니라 유지한다. 방 설정·API 응답에 이미 나가 있고
	 * 프론트가 그 값을 읽는다. 페이즈를 끼우는 데만 쓰지 않을 뿐이다.
	 */
	private String nextPhase(TimerState state) {
		if (FOCUS.equals(state.phase)) {
			return state.breakSeconds > 0 ? BREAK : FOCUS;
		}
		// BREAK (그리고 예전 데이터로 남아 있을 수 있는 STRETCHING)에서는 집중으로 돌아간다
		return FOCUS;
	}

	/**
	 * 이 페이즈가 몇 초짜리인지.
	 *
	 * <p>
	 * STRETCHING 은 이제 새로 만들어지지 않지만(nextPhase 참고), 서버를 올리는 순간 이미
	 * 그 구간을 돌고 있던 방이 있을 수 있다. 그 방이 다음 전환까지 정상으로 흐르도록 길이는
	 * 계속 알려 준다 — 여기서 빼면 그 방만 집중 시간(수십 분)짜리 '쉬는 시간'에 갇힌다.
	 */
	private int durationOf(String phase, TimerState state) {
		return switch (phase) {
			case STRETCHING -> STRETCH_SECONDS;
			case BREAK -> state.breakSeconds;
			default -> state.focusSeconds;
		};
	}

	private void closePhaseRecord(Long phaseRecordId) {
		phaseRecordRepository.findById(phaseRecordId).ifPresent(record -> {
			record.end(LocalDateTime.now());
			phaseRecordRepository.save(record);
		});
	}

	/**
	 * 현재 타이머 진행 상태 조회. 늦게 입장한 사람이 지금 페이즈·남은시간을 동기화할 때 쓴다.
	 *
	 * <p>
	 * 실행 중이 아니면 running=false로 돌려준다.
	 */
	@Transactional(readOnly = true)
	public TimerStateResponse getState(Long roomId) {
		// 존재하지 않는 방이면 404(소프트 삭제된 방 포함).
		studyRoomRepository.findById(roomId)
				.orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "스터디룸을 찾을 수 없습니다: " + roomId));

		TimerState state = timers.get(roomId);
		if (state == null) {
			return TimerStateResponse.notRunning();
		}
		long remaining = Math.max(0, Duration.between(Instant.now(), state.phaseEndsAt).getSeconds());
		return new TimerStateResponse(true, state.phase, state.sequence, durationOf(state.phase, state), remaining,
				state.stretchingEnabled);
	}

	private void broadcast(String type, Long roomId, TimerState state) {
		int duration = durationOf(state.phase, state);
		long remaining = Math.max(0, Duration.between(Instant.now(), state.phaseEndsAt).getSeconds());
		TimerPhaseResponse response = new TimerPhaseResponse(type, roomId, state.phase, state.sequence, duration,
				remaining, state.stretchingEnabled);
		messagingTemplate.convertAndSend("/topic/study-rooms/" + roomId + "/timer", response);
	}

	private StudyRoom findHostRoomOrThrow(Long roomId, Long memberId) {
		StudyRoom room = studyRoomRepository.findById(roomId)
				.orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "스터디룸을 찾을 수 없습니다: " + roomId));
		if (!room.getHostMemberId().equals(memberId)) {
			throw new ResponseStatusException(HttpStatus.FORBIDDEN, "방장만 타이머를 제어할 수 있습니다.");
		}
		return room;
	}

	/** 진행 중 타이머 상태(메모리). 초 단위로 바뀌므로 DB에 매번 쓰지 않는다. */
	private static class TimerState {
		private String phase;
		private int sequence;
		private Instant phaseEndsAt;
		private Long currentPhaseRecordId;
		/*
		 * 진행 중에 방장이 바꿀 수 있어 final 이 아니다(applySettings 참고).
		 *
		 * 지금 도는 구간의 남은 시간은 phaseEndsAt 이 들고 있어서, 여기 값을 바꿔도 그 구간은
		 * 원래 길이대로 끝난다. 새 값은 다음 전환부터 durationOf 를 통해 쓰인다.
		 */
		private int focusSeconds;
		private int breakSeconds;
		private final boolean stretchingEnabled;

		private TimerState(String phase, int sequence, Instant phaseEndsAt, Long currentPhaseRecordId, int focusSeconds,
				int breakSeconds, boolean stretchingEnabled) {
			this.phase = phase;
			this.sequence = sequence;
			this.phaseEndsAt = phaseEndsAt;
			this.currentPhaseRecordId = currentPhaseRecordId;
			this.focusSeconds = focusSeconds;
			this.breakSeconds = breakSeconds;
			this.stretchingEnabled = stretchingEnabled;
		}
	}
}
