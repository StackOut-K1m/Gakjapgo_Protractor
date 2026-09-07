package com.protractor.backend.domain.notification.entity;

/**
 * 알림 종류. DB type 컬럼(VARCHAR(50))에 문자열로 저장되며, FE가 이 값을 보고 아이콘·이동 경로를 분기하므로
 * 이름이 곧 API 계약이다. 친구·DM 등 다른 알림은 해당 담당이 붙을 때 여기에 추가한다.
 */
public enum NotificationType {

    /** 주간 리포트 안내. 매주 월요일 00:00 스케줄러가 발송한다. */
    REPORT,
    FRIENDSHIP,
    DM
}
