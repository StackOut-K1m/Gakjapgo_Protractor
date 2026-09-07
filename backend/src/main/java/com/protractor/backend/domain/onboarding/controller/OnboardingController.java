package com.protractor.backend.domain.onboarding.controller;

import com.protractor.backend.domain.onboarding.dto.OnboardingMeResponse;
import com.protractor.backend.domain.onboarding.dto.OnboardingOptionsResponse;
import com.protractor.backend.domain.onboarding.dto.OnboardingSaveRequest;
import com.protractor.backend.domain.onboarding.dto.OnboardingSaveResponse;
import com.protractor.backend.domain.onboarding.dto.OnboardingUpdateRequest;
import com.protractor.backend.domain.onboarding.dto.OnboardingUpdateResponse;
import com.protractor.backend.domain.onboarding.service.OnboardingService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@Tag(name = "Onboarding", description = "온보딩 API")
@RestController
@RequestMapping("/api/v1/onboarding")
@RequiredArgsConstructor
public class OnboardingController {

    private final OnboardingService onboardingService;

    @Operation(summary = "온보딩 선택지 조회 (학습 목적/관심 태그/동의 항목)")
    @GetMapping("/options")
    public ResponseEntity<OnboardingOptionsResponse> getOptions() {
        return ResponseEntity.ok(onboardingService.getOptions());
    }

    @Operation(summary = "온보딩 정보 저장 (최초 1회, 이미 완료면 409)")
    @PostMapping
    public ResponseEntity<OnboardingSaveResponse> save(
            Authentication authentication,
            @Valid @RequestBody OnboardingSaveRequest request
    ) {
        Long memberId = (Long) authentication.getPrincipal();
        OnboardingSaveResponse response = onboardingService.save(memberId, request);
        return ResponseEntity.status(HttpStatus.CREATED).body(response);
    }

    @Operation(summary = "내 온보딩 정보 조회")
    @GetMapping("/me")
    public ResponseEntity<OnboardingMeResponse> getMe(Authentication authentication) {
        Long memberId = (Long) authentication.getPrincipal();
        return ResponseEntity.ok(onboardingService.getMe(memberId));
    }

    @Operation(summary = "내 온보딩 정보 수정 (보낸 필드만 반영, 동의는 false로 철회 가능)")
    @PatchMapping("/me")
    public ResponseEntity<OnboardingUpdateResponse> update(
            Authentication authentication,
            @Valid @RequestBody OnboardingUpdateRequest request
    ) {
        Long memberId = (Long) authentication.getPrincipal();
        return ResponseEntity.ok(onboardingService.update(memberId, request));
    }
}
