package com.protractor.backend.domain.studyroom.service;

import com.protractor.backend.domain.studyroom.dto.ChatMessageResponse;
import java.util.ArrayDeque;
import java.util.Deque;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.stereotype.Service;

/**
 * 방별 최근 채팅 보관소.
 *
 * <p>
 * 채팅은 DB에 저장하지 않기로 했지만, 그러면 새로고침만 해도 대화가 통째로 사라진다. 구독은 그 뒤에 오는 메시지만 받기
 * 때문이다. 그래서 방마다 최근 몇 건만 메모리에 들고 있다가 입장·재접속할 때 한 번 내려준다.
 *
 * <p>
 * 오래된 대화까지 보여주려면 테이블이 필요하다. 그건 팀에서 채팅 저장 정책이 정해진 뒤에 다룬다.
 */
@Service
public class ChatHistoryService {

	/** 방마다 들고 있을 최대 메시지 수. 늘리면 메모리도 그만큼 늘어난다. */
	private static final int MAX_MESSAGES = 50;

	private final Map<Long, Deque<ChatMessageResponse>> messagesByRoom = new ConcurrentHashMap<>();

	/** 새 메시지를 보관한다. 한도를 넘으면 가장 오래된 것부터 버린다. */
	public void add(Long roomId, ChatMessageResponse message) {
		Deque<ChatMessageResponse> messages = messagesByRoom.computeIfAbsent(roomId, id -> new ArrayDeque<>());
		// 한 방의 대화는 순서가 중요해서 통째로 잠근다. 방마다 따로 잠그므로 다른 방과는 경쟁하지 않는다.
		synchronized (messages) {
			messages.addLast(message);
			while (messages.size() > MAX_MESSAGES) {
				messages.removeFirst();
			}
		}
	}

	/** 최근 메시지를 오래된 순으로 돌려준다. 없으면 빈 목록. */
	public List<ChatMessageResponse> getRecent(Long roomId) {
		Deque<ChatMessageResponse> messages = messagesByRoom.get(roomId);
		if (messages == null) {
			return List.of();
		}
		synchronized (messages) {
			return List.copyOf(messages);
		}
	}

	/** 방이 사라지면 대화도 버린다. 남겨두면 메모리가 계속 늘어난다. */
	public void clear(Long roomId) {
		messagesByRoom.remove(roomId);
	}
}
