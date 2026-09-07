package com.protractor.backend.domain.studyroom.service;

import com.protractor.backend.domain.studyroom.dto.MediaStateResponse;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.stereotype.Service;

/**
 * 방별 미디어 상태(카메라·마이크·화면공유) 보관소.
 *
 * <p>
 * 상태 변화는 WebSocket으로 바로 전파되지만, 그 이벤트는 <b>그 순간 접속해 있던 사람에게만</b> 간다. 늦게 들어온 사람은
 * 기존 참여자가 마이크를 껐는지 알 수 없어, 방에 들어올 때 현재 상태를 한 번 받아 가야 한다. 그 스냅샷을 여기서 들고 있는다.
 *
 * <p>
 * 카메라 토글처럼 자주 바뀌고 기록으로 남길 필요가 없는 값이라 DB에 쓰지 않는다(타이머 진행 상태와 같은 이유). 서버가
 * 재시작되면 비고, 각자 다음 토글 때 다시 채워진다. 다중 서버로 늘리면 Redis로 옮겨야 한다.
 */
@Service
public class MediaStateService {

	/** 방 id -> (회원 id -> 미디어 상태) */
	private final Map<Long, Map<Long, MediaStateResponse>> statesByRoom = new ConcurrentHashMap<>();

	/** 상태를 갱신한다. 같은 회원이 다시 보내면 덮어쓴다. */
	public void update(Long roomId, MediaStateResponse state) {
		statesByRoom.computeIfAbsent(roomId, id -> new ConcurrentHashMap<>()).put(state.memberId(), state);
	}

	/** 방의 현재 상태 목록. 아직 아무도 보낸 적 없으면 빈 목록이다. */
	public List<MediaStateResponse> getAll(Long roomId) {
		Map<Long, MediaStateResponse> states = statesByRoom.get(roomId);
		return states == null ? List.of() : List.copyOf(states.values());
	}

	/** 퇴장·이탈한 회원의 상태를 지운다. 남겨두면 없는 사람이 계속 목록에 뜬다. */
	public void remove(Long roomId, Long memberId) {
		Map<Long, MediaStateResponse> states = statesByRoom.get(roomId);
		if (states == null) {
			return;
		}
		states.remove(memberId);
		if (states.isEmpty()) {
			statesByRoom.remove(roomId); // 빈 방의 껍데기를 남기지 않는다.
		}
	}
}
