package com.protractor.backend.domain.notification.dto;

import com.protractor.backend.domain.notification.entity.Notification;
import com.protractor.backend.domain.notification.entity.NotificationType;
import java.time.LocalDateTime;
import java.util.List;
import org.springframework.data.domain.Page;

/**
 * GET /notifications 응답 — 명세 88행의 { notifications[], page } 형태(중첩 page 객체).
 *
 * <p>
 * 미읽음 개수 전용 API는 명세에 없다. 종 아이콘 배지는 unreadOnly=true&size=1 로 호출해
 * page.totalElements 를 쓰기로 FE와 합의된 방식이다.
 */
public record NotificationListResponse(List<Item> notifications, PageInfo page) {

    /** readAt이 null이면 안 읽은 알림이다. FE는 type을 보고 이동 경로를 분기한다(REPORT=리포트 페이지). */
    public record Item(Long notificationId, NotificationType type, String title, String message,
            String referenceType, Long referenceId, LocalDateTime readAt, LocalDateTime createdAt) {

        public static Item of(Notification notification) {
            return new Item(notification.getId(), notification.getType(), notification.getTitle(),
                    notification.getMessage(), notification.getReferenceType(), notification.getReferenceId(),
                    notification.getReadAt(), notification.getCreatedAt());
        }
    }

    public record PageInfo(int page, int size, long totalElements, int totalPages) {
    }

    public static NotificationListResponse of(Page<Notification> notificationPage) {
        return new NotificationListResponse(
                notificationPage.getContent().stream().map(Item::of).toList(),
                new PageInfo(notificationPage.getNumber(), notificationPage.getSize(),
                        notificationPage.getTotalElements(), notificationPage.getTotalPages()));
    }
}
