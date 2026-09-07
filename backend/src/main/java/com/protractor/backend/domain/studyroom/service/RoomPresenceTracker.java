package com.protractor.backend.domain.studyroom.service;

import com.protractor.backend.domain.studyrecord.repository.StudyRecordRepository;
import com.protractor.backend.domain.studyrecord.service.StudyRecordService;
import java.time.Duration;
import java.time.Instant;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import lombok.RequiredArgsConstructor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.event.EventListener;
import org.springframework.messaging.simp.SimpMessageHeaderAccessor;
import org.springframework.messaging.simp.SimpMessageType;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.messaging.simp.stomp.StompHeaderAccessor;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.messaging.SessionDisconnectEvent;
import org.springframework.web.socket.messaging.SessionSubscribeEvent;

/**
 * 접속 여부로 실제 퇴장을 판단한다.
 *
 * <p>
 * 나가기 버튼을 누르면 퇴장 API가 불리지만, 창을 닫거나 인터넷이 끊기면 아무것도 오지 않는다. 그러면 서버는 그 사람이 아직 방에
 * 있다고 믿게 되고, 정원이 유령으로 차거나 방장이 사라진 방이 남고 빈 방도 정리되지 않는다.
 *
 * <p>
 * 그래서 방마다 하나씩 열려 있는 WebSocket 연결을 "접속 중" 신호로 쓴다. 연결이 끊기고 유예 시간 안에 돌아오지 않으면
 * 퇴장으로 처리한다. 유예를 두는 이유는 새로고침도 연결을 한 번 끊기 때문이다. 바로 처리하면 새로고침만 해도 방에서 나가진다.
 */
@Component
@RequiredArgsConstructor
public class RoomPresenceTracker {

	private static final Logger log = LoggerFactory.getLogger(RoomPresenceTracker.class);

	/** 참여자 토픽 구독을 보고 이 사람이 어느 방에 있는지 안다. */
	private static final Pattern PARTICIPANTS_TOPIC = Pattern.compile("^/topic/study-rooms/(\\d+)/participants$");

	/** 연결이 끊긴 뒤 이만큼 지나도 안 돌아오면 퇴장으로 본다. 값의 근거는 {@link RoomLifecyclePolicy}에 있다. */
	private static final Duration GRACE = RoomLifecyclePolicy.DISCONNECT_GRACE;

	private final StudyRoomService studyRoomService;
	private final StudyRoomEventPublisher studyRoomEventPublisher;
	private final MediaStateService mediaStateService;
	private final SimpMessagingTemplate messagingTemplate;
	private final StudyRecordRepository studyRecordRepository;
	private final StudyRecordService studyRecordService;

	/** WebSocket 세션 id -> 그 세션이 보고 있는 방·회원 */
	private final Map<String, Presence> sessions = new ConcurrentHashMap<>();

	/** 끊긴 (방,회원) -> 끊긴 시각. 유예 시간이 지나면 퇴장 처리한다. */
	private final Map<Presence, Instant> disconnectedAt = new ConcurrentHashMap<>();

	/** 참여자 토픽을 구독하는 순간 그 사람이 그 방에 있다고 본다. */
	@EventListener
	public void onSubscribe(SessionSubscribeEvent event) {
		StompHeaderAccessor accessor = StompHeaderAccessor.wrap(event.getMessage());
		String destination = accessor.getDestination();
		if (destination == null || accessor.getUser() == null) {
			return;
		}
		Matcher matcher = PARTICIPANTS_TOPIC.matcher(destination);
		if (!matcher.matches()) {
			return;
		}

		Presence presence = new Presence(Long.parseLong(matcher.group(1)),
				Long.parseLong(accessor.getUser().getName()));
		String sessionId = accessor.getSessionId();

		// 같은 계정이 다른 탭·창으로 같은 방에 또 들어온 경우, 먼저 있던 접속을 내보낸다.
		// 두 화면이 같이 떠 있으면 카메라·자세 판정이 이중으로 돌고 어느 쪽 상태가 맞는지도 알 수 없다.
		evictOtherSessions(presence, sessionId);

		sessions.put(sessionId, presence);
		// 새로고침 등으로 다시 붙었다면 예약된 퇴장 처리를 취소한다.
		disconnectedAt.remove(presence);
	}

	/** 같은 (방, 회원)으로 이미 열려 있던 다른 접속에 종료를 알린다. 받은 쪽은 방 화면을 닫는다. */
	private void evictOtherSessions(Presence presence, String newSessionId) {
		sessions.forEach((sessionId, existing) -> {
			if (sessionId.equals(newSessionId) || !existing.equals(presence)) {
				return;
			}
			sessions.remove(sessionId);
			sendEviction(sessionId);
			log.info("같은 계정의 새 접속으로 기존 접속을 종료했습니다. room={}, member={}", presence.roomId(),
					presence.memberId());
		});
	}

	/**
	 * 지정한 접속 하나에만 메시지를 보낸다.
	 *
	 * <p>
	 * 세션 id를 헤더에 넣어야 브로드캐스트가 아니라 그 접속으로만 전달된다. 같은 계정의 다른 탭은 받으면 안 되기 때문이다.
	 */
	private void sendEviction(String sessionId) {
		SimpMessageHeaderAccessor headers = SimpMessageHeaderAccessor.create(SimpMessageType.MESSAGE);
		headers.setSessionId(sessionId);
		headers.setLeaveMutable(true);
		messagingTemplate.convertAndSendToUser(sessionId, "/queue/session-evicted",
				Map.of("reason", "DUPLICATE_SESSION"), headers.getMessageHeaders());
	}

	/** 연결이 끊겼다. 같은 사람의 다른 연결이 없을 때만 퇴장 후보로 올린다(탭 두 개 대응). */
	@EventListener
	public void onDisconnect(SessionDisconnectEvent event) {
		Presence presence = sessions.remove(event.getSessionId());
		if (presence == null) {
			return;
		}
		if (!sessions.containsValue(presence)) {
			disconnectedAt.put(presence, Instant.now());
		}
	}

	/**
	 * 유예 시간이 지난 이탈자를 퇴장 처리한다. 여기서 방장 위임·빈 방 종료도 함께 일어난다.
	 *
	 * <p>
	 * 순회 대상은 끊긴 사람 목록뿐이라 평소에는 할 일이 없다(DB도 건드리지 않는다). 그래서 주기를 촘촘히 잡아도 비용이 거의
	 * 없고, 실제 정리 시점은 유예 + 최대 이 주기가 된다.
	 */
	@Scheduled(fixedRate = RoomLifecyclePolicy.SWEEP_INTERVAL_MS)
	public void sweep() {
		Instant deadline = Instant.now().minus(GRACE);
		disconnectedAt.forEach((presence, since) -> {
			if (since.isAfter(deadline) || sessions.containsValue(presence)) {
				return;
			}
			disconnectedAt.remove(presence);
			leaveQuietly(presence);
		});
	}

	/**
	 * 퇴장 처리. 이미 나간 사람이면 조용히 넘어간다.
	 *
	 * <p>
	 * 정리 작업이라 실패해도 다른 사람의 이탈 처리를 막으면 안 되므로 예외를 삼킨다.
	 */
	private void leaveQuietly(Presence presence) {
		try {
			// 나가기 버튼과 같은 결과가 되도록 세션도 마무리한다(점수 계산 포함).
			// 퇴장 처리보다 먼저 해야 한다. 퇴장이 방을 지우면 기록을 못 찾을 수 있다.
			endStudyRecordQuietly(presence);
			studyRoomService.leave(presence.roomId(), presence.memberId());
			mediaStateService.remove(presence.roomId(), presence.memberId());
			studyRoomEventPublisher.participantLeft(presence.roomId(), presence.memberId());
			log.info("접속이 끊겨 퇴장 처리했습니다. room={}, member={}", presence.roomId(), presence.memberId());
		} catch (Exception e) {
			// 나가기 버튼으로 이미 처리됐거나 방이 사라진 경우가 대부분이다.
			log.debug("이탈 퇴장 처리 생략 room={}, member={} ({})", presence.roomId(), presence.memberId(),
					e.getMessage());
		}
	}

	/**
	 * 그 사람의 이번 세션을 종료 처리한다.
	 *
	 * <p>
	 * 세션 마무리는 부가 작업이라, 실패해도 퇴장 처리(방장 위임·빈 방 정리)까지 막으면 안 된다.
	 */
	private void endStudyRecordQuietly(Presence presence) {
		try {
			studyRecordRepository
					.findFirstByStudyRoomIdAndMemberIdAndLeftAtIsNullOrderByIdDesc(presence.roomId(), presence.memberId())
					.ifPresent(record -> studyRecordService.endByDisconnect(record.getId()));
		} catch (Exception e) {
			log.debug("이탈 세션 종료 생략 room={}, member={} ({})", presence.roomId(), presence.memberId(),
					e.getMessage());
		}
	}

	/** 어느 방의 누구인지. 값이 같으면 같은 사람으로 본다(record 라 equals/hashCode 자동). */
	private record Presence(Long roomId, Long memberId) {
	}
}
