package com.protractor.backend.domain.onboarding.dto;

import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.Size;
import java.util.List;

/**
 * 온보딩 수정 요청. null인 필드는 건드리지 않는다(부분 수정).
 *
 * <p>
 * 감지 동의 2종(자세·졸음)은 가입 시 필수이고 가입 후에도 끌 수 없다(팀 결정, 2026-08-03).
 * null(변경 없음)과 true(과거 미동의 계정의 뒤늦은 동의)만 받고 false는 400으로 거절한다.
 * 캡처 동의는 부가 기능이라 계속 자유롭게 켜고 끈다.
 */
public record OnboardingUpdateRequest(
        @Size(max = 20, message = "공부 목적은 20개까지 선택할 수 있습니다.")
        List<String> purposes,

        @Size(max = 255, message = "학습 목표는 255자 이하여야 합니다.")
        String goalText,

        // 하루 목표 학습 시간(분). 0을 보내면 목표 해제다.
        @Min(value = 0, message = "목표 시간은 0(해제) 이상이어야 합니다.")
        Integer goalMinutes,

        @Size(max = 20, message = "관심 태그는 20개까지 선택할 수 있습니다.")
        List<Long> tagIds,

        @AssertTrue(message = "자세 감지 동의는 철회할 수 없습니다.")
        Boolean postureDetectionConsent,

        @AssertTrue(message = "졸음 감지 동의는 철회할 수 없습니다.")
        Boolean drowsinessDetectionConsent,

        Boolean postureCaptureConsent
) {
    public boolean hasNoChanges() {
        return purposes == null && goalText == null && goalMinutes == null && tagIds == null
                && postureDetectionConsent == null && drowsinessDetectionConsent == null
                && postureCaptureConsent == null;
    }

    public boolean hasConsentChange() {
        return postureDetectionConsent != null || drowsinessDetectionConsent != null
                || postureCaptureConsent != null;
    }
}
