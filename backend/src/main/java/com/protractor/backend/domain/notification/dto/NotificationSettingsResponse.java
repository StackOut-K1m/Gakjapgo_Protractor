package com.protractor.backend.domain.notification.dto;

import com.protractor.backend.domain.notification.entity.MemberNotificationSettings;

public record NotificationSettingsResponse(boolean friendEnabled, boolean dmEnabled, boolean communityEnabled,
        boolean inquiryEnabled, boolean noticeEnabled, boolean reportEnabled, boolean rankingEnabled) {

    public static NotificationSettingsResponse defaults() {
        return new NotificationSettingsResponse(true, true, true, true, true, true, true);
    }

    public static NotificationSettingsResponse from(MemberNotificationSettings settings) {
        return new NotificationSettingsResponse(settings.isFriendEnabled(), settings.isDmEnabled(),
                settings.isCommunityEnabled(), settings.isInquiryEnabled(), settings.isNoticeEnabled(),
                settings.isReportEnabled(), settings.isRankingEnabled());
    }
}
