package com.protractor.backend.domain.notification.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.LocalDateTime;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.CreationTimestamp;

/** 회원에게 도착한 알림 한 건. 공식 스키마 {@code notifications} 매핑. */
@Entity
@Table(name = "notifications")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class Notification {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "notification_id")
    private Long id;

    @Column(name = "receiver_member_id", nullable = false)
    private Long receiverMemberId;

    /** 시스템 발송(리포트 안내 등)은 보낸 사람이 없다. 친구 신청처럼 사람이 보내는 알림에서만 채운다. */
    @Column(name = "sender_member_id")
    private Long senderMemberId;

    @Enumerated(EnumType.STRING)
    @Column(name = "type", nullable = false, length = 50)
    private NotificationType type;

    @Column(name = "title", nullable = false, length = 200)
    private String title;

    @Column(name = "message", length = 500)
    private String message;

    /** 클릭 시 이동할 대상의 종류·id. 리포트 안내 알림은 발송 시점에 리포트가 없을 수 있어 id가 비어 있다. */
    @Column(name = "reference_type", length = 50)
    private String referenceType;

    @Column(name = "reference_id")
    private Long referenceId;

    /** 비어 있으면 아직 안 읽은 알림이다. */
    @Column(name = "read_at")
    private LocalDateTime readAt;

    @CreationTimestamp
    @Column(name = "created_at", updatable = false)
    private LocalDateTime createdAt;

    private Notification(Long receiverMemberId, NotificationType type, String title, String message,
            String referenceType, Long referenceId) {
        this.receiverMemberId = receiverMemberId;
        this.type = type;
        this.title = title;
        this.message = message;
        this.referenceType = referenceType;
        this.referenceId = referenceId;
    }

    /** 주간 리포트 안내 알림. */
    public static Notification weeklyReport(Long receiverMemberId, String title, String message) {
        return new Notification(receiverMemberId, NotificationType.REPORT, title, message,
                NotificationType.REPORT.name(), null);
    }

    public static Notification friendship(Long receiverMemberId, Long senderMemberId, Long friendshipId,
            String title, String message) {
        Notification notification = new Notification(receiverMemberId, NotificationType.FRIENDSHIP, title, message,
                "FRIENDSHIP", friendshipId);
        notification.senderMemberId = senderMemberId;
        return notification;
    }

    public static Notification dm(Long receiverMemberId, Long senderMemberId, Long roomId, String message) {
        Notification notification = new Notification(receiverMemberId, NotificationType.DM, "새 DM 메시지", message,
                "DM_ROOM", roomId);
        notification.senderMemberId = senderMemberId;
        return notification;
    }

    /** 읽음 처리. 이미 읽은 알림은 처음 읽은 시각을 유지한다(같은 요청을 다시 보내도 결과가 같다). */
    public void markRead() {
        if (this.readAt == null) {
            this.readAt = LocalDateTime.now();
        }
    }
}
