package com.protractor.backend.domain.onboarding.dto;

import com.protractor.backend.domain.studytag.dto.StudyTagResponse;
import java.util.List;

public record OnboardingOptionsResponse(
        List<String> purposes,
        List<StudyTagResponse> tags,
        List<ConsentItemResponse> consentItems
) {
    /** key는 온보딩 저장 요청의 동의 필드명과 같다. 프론트가 이 값으로 체크박스 → 요청 필드를 매핑한다. */
    public record ConsentItemResponse(
            String key,
            String label,
            String description
    ) {
    }
}
