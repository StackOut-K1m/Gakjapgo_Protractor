package com.protractor.backend.global.websocket;

import com.protractor.backend.domain.dm.dto.DmDtos.MessageResponse;
import com.protractor.backend.domain.notification.dto.NotificationListResponse.Item;
import lombok.RequiredArgsConstructor;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Component;

@Component
@RequiredArgsConstructor
public class RealtimeEventPublisher {
    private final ApplicationEventPublisher applicationEventPublisher;
    public void dm(Long receiverMemberId, Long roomId, MessageResponse message) { applicationEventPublisher.publishEvent(new DmEvent(receiverMemberId, roomId, message)); }
    public void notification(Long receiverMemberId, Item notification) { applicationEventPublisher.publishEvent(new NotificationEvent(receiverMemberId, notification)); }
    public void friendship(Long receiverMemberId, String type, Long memberId, Long friendshipId) { applicationEventPublisher.publishEvent(new FriendshipEvent(receiverMemberId, type, memberId, friendshipId)); }
    public record DmEvent(Long receiverMemberId, Long roomId, MessageResponse message) {}
    public record NotificationEvent(Long receiverMemberId, Item notification) {}
    public record FriendshipEvent(Long receiverMemberId, String type, Long memberId, Long friendshipId) {}
}
