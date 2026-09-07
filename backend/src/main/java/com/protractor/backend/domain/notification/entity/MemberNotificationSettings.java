package com.protractor.backend.domain.notification.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.LocalDateTime;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

/** 회원별 알림 유형 수신 설정. 설정 행이 없으면 모든 유형 수신이 기본 정책이다. */
@Entity
@Table(name = "member_notification_settings")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class MemberNotificationSettings {

    @Id
    @Column(name = "member_id")
    private Long memberId;

    @Column(name = "friend_enabled", nullable = false) private boolean friendEnabled = true;
    @Column(name = "dm_enabled", nullable = false) private boolean dmEnabled = true;
    @Column(name = "community_enabled", nullable = false) private boolean communityEnabled = true;
    @Column(name = "inquiry_enabled", nullable = false) private boolean inquiryEnabled = true;
    @Column(name = "notice_enabled", nullable = false) private boolean noticeEnabled = true;
    @Column(name = "report_enabled", nullable = false) private boolean reportEnabled = true;
    @Column(name = "ranking_enabled", nullable = false) private boolean rankingEnabled = true;

    @Column(name = "created_at", nullable = false, updatable = false) private LocalDateTime createdAt;
    @Column(name = "updated_at", nullable = false) private LocalDateTime updatedAt;

    private MemberNotificationSettings(Long memberId) {
        this.memberId = memberId;
        LocalDateTime now = LocalDateTime.now();
        this.createdAt = now;
        this.updatedAt = now;
    }

    public static MemberNotificationSettings defaults(Long memberId) {
        return new MemberNotificationSettings(memberId);
    }

    public void update(Boolean friendEnabled, Boolean dmEnabled, Boolean communityEnabled, Boolean inquiryEnabled,
            Boolean noticeEnabled, Boolean reportEnabled, Boolean rankingEnabled) {
        if (friendEnabled != null) this.friendEnabled = friendEnabled;
        if (dmEnabled != null) this.dmEnabled = dmEnabled;
        if (communityEnabled != null) this.communityEnabled = communityEnabled;
        if (inquiryEnabled != null) this.inquiryEnabled = inquiryEnabled;
        if (noticeEnabled != null) this.noticeEnabled = noticeEnabled;
        if (reportEnabled != null) this.reportEnabled = reportEnabled;
        if (rankingEnabled != null) this.rankingEnabled = rankingEnabled;
        this.updatedAt = LocalDateTime.now();
    }
}
