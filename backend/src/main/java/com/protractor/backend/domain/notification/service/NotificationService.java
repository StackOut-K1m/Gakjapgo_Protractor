package com.protractor.backend.domain.notification.service;

import com.protractor.backend.domain.notification.dto.NotificationListResponse;
import com.protractor.backend.domain.notification.dto.NotificationListResponse.Item;
import com.protractor.backend.domain.notification.dto.NotificationReadResponse;
import com.protractor.backend.domain.notification.entity.MemberNotificationSettings;
import com.protractor.backend.domain.notification.entity.Notification;
import com.protractor.backend.domain.notification.repository.MemberNotificationSettingsRepository;
import com.protractor.backend.domain.notification.repository.NotificationRepository;
import com.protractor.backend.global.exception.BusinessException;
import com.protractor.backend.global.websocket.RealtimeEventPublisher;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class NotificationService {
    private final NotificationRepository notificationRepository;
    private final MemberNotificationSettingsRepository settingsRepository;
    private final RealtimeEventPublisher realtimeEvents;

    @Transactional
    public void friendshipRequest(Long receiverId, Long senderId, Long friendshipId) {
        if (receivesFriendNotification(receiverId)) {
            publish(receiverId, notificationRepository.save(Notification.friendship(receiverId, senderId, friendshipId,
                    "친구 신청을 받았습니다.", "친구 신청을 수락하거나 거절할 수 있습니다.")));
        }
    }

    @Transactional
    public void dmMessage(Long receiverId, Long senderId, Long roomId, String content) {
        if (receivesDmNotification(receiverId)) {
            publish(receiverId, notificationRepository.save(Notification.dm(receiverId, senderId, roomId, content)));
        }
    }

    @Transactional(readOnly = true)
    public NotificationListResponse getNotifications(Long memberId, boolean unreadOnly, int page, int size) {
        Pageable pageable = PageRequest.of(page, size, Sort.by(Sort.Direction.DESC, "createdAt", "id"));
        Page<Notification> notifications = unreadOnly
                ? notificationRepository.findByReceiverMemberIdAndReadAtIsNull(memberId, pageable)
                : notificationRepository.findByReceiverMemberId(memberId, pageable);
        return NotificationListResponse.of(notifications);
    }

    @Transactional
    public NotificationReadResponse markRead(Long memberId, Long notificationId) {
        Notification notification = notificationRepository.findByIdAndReceiverMemberId(notificationId, memberId)
                .orElseThrow(() -> new BusinessException(HttpStatus.NOT_FOUND, "Notification not found."));
        notification.markRead();
        return new NotificationReadResponse(notification.getId(), notification.getReadAt());
    }

    @Transactional
    public void markAllRead(Long memberId) {
        notificationRepository.markAllUnreadAsRead(memberId);
    }

    @Transactional
    public void deleteAllRead(Long memberId) {
        notificationRepository.deleteAllReadByReceiverMemberId(memberId);
    }

    private void publish(Long receiverId, Notification notification) {
        realtimeEvents.notification(receiverId, Item.of(notification));
    }

    private boolean receivesFriendNotification(Long memberId) {
        return settingsRepository.findById(memberId).map(MemberNotificationSettings::isFriendEnabled).orElse(true);
    }

    private boolean receivesDmNotification(Long memberId) {
        return settingsRepository.findById(memberId).map(MemberNotificationSettings::isDmEnabled).orElse(true);
    }
}
