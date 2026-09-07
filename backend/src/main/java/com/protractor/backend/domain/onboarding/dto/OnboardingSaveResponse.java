package com.protractor.backend.domain.onboarding.dto;

import com.protractor.backend.domain.onboarding.entity.MemberPreference;
import java.time.LocalDateTime;

public record OnboardingSaveResponse(
        Long memberId,
        LocalDateTime onboardingCompletedAt
) {
    public static OnboardingSaveResponse from(MemberPreference preference) {
        return new OnboardingSaveResponse(preference.getMemberId(), preference.getOnboardingCompletedAt());
    }
}
