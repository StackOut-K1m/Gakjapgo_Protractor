package com.protractor.backend.domain.notification.controller;

import com.protractor.backend.domain.notification.dto.NotificationListResponse;
import com.protractor.backend.domain.notification.dto.NotificationReadResponse;
import com.protractor.backend.domain.notification.service.NotificationService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@Tag(name = "Notification", description = "알림 API")
@RestController
@RequestMapping("/api/v1/notifications")
@RequiredArgsConstructor
public class NotificationController {

    private final NotificationService notificationService;

    @Operation(summary = "내 알림 목록 조회 (최신순. 미읽음 개수는 unreadOnly=true&size=1 의 page.totalElements 사용)")
    @GetMapping
    public ResponseEntity<NotificationListResponse> getNotifications(
            Authentication authentication,
            @RequestParam(defaultValue = "false") boolean unreadOnly,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "10") int size) {
        Long memberId = (Long) authentication.getPrincipal();
        return ResponseEntity.ok(notificationService.getNotifications(memberId, unreadOnly, page, size));
    }

    @Operation(summary = "알림 읽음 처리 (이미 읽은 알림은 처음 읽은 시각 유지)")
    @PatchMapping("/{notificationId}/read")
    public ResponseEntity<NotificationReadResponse> markRead(Authentication authentication,
            @PathVariable Long notificationId) {
        Long memberId = (Long) authentication.getPrincipal();
        return ResponseEntity.ok(notificationService.markRead(memberId, notificationId));
    }

    @Operation(summary = "Mark all unread notifications as read")
    @PatchMapping("/read-all")
    public ResponseEntity<Void> markAllRead(Authentication authentication) {
        notificationService.markAllRead((Long) authentication.getPrincipal());
        return ResponseEntity.noContent().build();
    }

    @Operation(summary = "Delete all read notifications")
    @DeleteMapping("/read")
    public ResponseEntity<Void> deleteAllRead(Authentication authentication) {
        notificationService.deleteAllRead((Long) authentication.getPrincipal());
        return ResponseEntity.noContent().build();
    }
}
