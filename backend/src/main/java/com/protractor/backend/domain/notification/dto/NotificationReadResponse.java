package com.protractor.backend.domain.notification.dto;

import java.time.LocalDateTime;

/** PATCH /notifications/{id}/read 응답 — 명세 89행 { notificationId, readAt } 그대로. */
public record NotificationReadResponse(Long notificationId, LocalDateTime readAt) {
}
