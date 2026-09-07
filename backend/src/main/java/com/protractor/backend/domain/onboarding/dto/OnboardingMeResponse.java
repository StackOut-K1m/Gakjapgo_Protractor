package com.protractor.backend.domain.onboarding.dto;

import com.protractor.backend.domain.onboarding.entity.MemberPreference;
import com.protractor.backend.domain.studytag.dto.StudyTagResponse;
import com.protractor.backend.domain.studytag.entity.StudyTag;
import java.time.LocalDateTime;
import java.util.List;

public record OnboardingMeResponse(
        List<String> purposes,
        String goalText,
        Integer goalMinutes,
        List<StudyTagResponse> tags,
        boolean postureDetectionConsent,
        boolean drowsinessDetectionConsent,
        boolean postureCaptureConsent,
        /** 처음 온보딩을 끝낸 시각. 이후 수정으로는 바뀌지 않는다 */
        LocalDateTime onboardingCompletedAt,
        /**
         * 마지막으로 값이 바뀐 시각.
         *
         * 온보딩을 다시 해도 완료 시각은 그대로라, 화면에 "마지막 설정"으로 보여 줄 값이
         * 없었다. 수정(PATCH)은 이 값을 올린다 — 감지 동의만 바꿔도 마찬가지다.
         */
        LocalDateTime updatedAt
) {
    public static OnboardingMeResponse of(MemberPreference preference, List<String> purposes, List<StudyTag> tags) {
        return new OnboardingMeResponse(
                purposes,
                preference.getGoalText(),
                preference.getGoalMinutes(),
                StudyTagResponse.listFrom(tags),
                preference.isPostureDetectionConsent(),
                preference.isDrowsinessDetectionConsent(),
                preference.isPostureCaptureConsent(),
                preference.getOnboardingCompletedAt(),
                preference.getUpdatedAt()
        );
    }
}
