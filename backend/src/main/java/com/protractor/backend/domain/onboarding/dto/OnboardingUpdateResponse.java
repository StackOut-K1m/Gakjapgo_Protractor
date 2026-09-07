package com.protractor.backend.domain.onboarding.dto;

import com.protractor.backend.domain.onboarding.entity.MemberPreference;
import java.time.LocalDateTime;

public record OnboardingUpdateResponse(
        Long memberId,
        LocalDateTime updatedAt
) {
    public static OnboardingUpdateResponse from(MemberPreference preference) {
        return new OnboardingUpdateResponse(preference.getMemberId(), preference.getUpdatedAt());
    }
}
