package com.protractor.backend.domain.notification.controller;

import com.protractor.backend.domain.notification.dto.NotificationSettingsResponse;
import com.protractor.backend.domain.notification.dto.NotificationSettingsUpdateRequest;
import com.protractor.backend.domain.notification.service.MemberNotificationSettingsService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@Tag(name = "NotificationSettings", description = "회원별 알림 수신 설정 API")
@RestController
@RequestMapping("/api/v1/members/me/notification-settings")
@RequiredArgsConstructor
public class MemberNotificationSettingsController {

    private final MemberNotificationSettingsService service;

    @Operation(summary = "알림 수신 설정 조회", description = "설정 행이 없으면 모든 유형 수신으로 응답한다.")
    @GetMapping
    public NotificationSettingsResponse get(Authentication authentication) {
        return service.get(currentMemberId(authentication));
    }

    @Operation(summary = "알림 수신 설정 수정", description = "보낸 항목만 수정하며, 첫 수정 시 설정 행을 생성한다.")
    @PatchMapping
    public NotificationSettingsResponse update(Authentication authentication,
            @Valid @RequestBody NotificationSettingsUpdateRequest request) {
        return service.update(currentMemberId(authentication), request);
    }

    private Long currentMemberId(Authentication authentication) {
        return (Long) authentication.getPrincipal();
    }
}
