package com.protractor.backend.global.websocket;

import java.util.Map;
import lombok.RequiredArgsConstructor;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

@Component
@RequiredArgsConstructor
public class RealtimeEventListener {
    private final SimpMessagingTemplate messagingTemplate;
    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void onDm(RealtimeEventPublisher.DmEvent event) { messagingTemplate.convertAndSendToUser(event.receiverMemberId().toString(), "/queue/dm", Map.of("roomId", event.roomId(), "message", event.message())); }
    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void onNotification(RealtimeEventPublisher.NotificationEvent event) { messagingTemplate.convertAndSendToUser(event.receiverMemberId().toString(), "/queue/notifications", event.notification()); }
    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void onFriendship(RealtimeEventPublisher.FriendshipEvent event) { messagingTemplate.convertAndSendToUser(event.receiverMemberId().toString(), "/queue/friendship", Map.of("type", event.type(), "memberId", event.memberId(), "friendshipId", event.friendshipId())); }
}
