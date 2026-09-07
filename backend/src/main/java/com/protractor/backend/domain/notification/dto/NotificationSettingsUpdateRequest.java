package com.protractor.backend.domain.notification.dto;

/** null인 항목은 바꾸지 않는 알림 설정 부분 수정 요청. */
public record NotificationSettingsUpdateRequest(Boolean friendEnabled, Boolean dmEnabled, Boolean communityEnabled,
        Boolean inquiryEnabled, Boolean noticeEnabled, Boolean reportEnabled, Boolean rankingEnabled) {
}
