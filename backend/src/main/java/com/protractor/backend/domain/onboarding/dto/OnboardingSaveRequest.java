package com.protractor.backend.domain.onboarding.dto;

import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.util.List;

public record OnboardingSaveRequest(
        @NotEmpty(message = "공부 목적은 1개 이상 선택해야 합니다.")
        @Size(max = 20, message = "공부 목적은 20개까지 선택할 수 있습니다.")
        List<String> purposes,

        @Size(max = 255, message = "학습 목표는 255자 이하여야 합니다.")
        String goalText,

        // 하루 목표 학습 시간(분). 목표 문구(goalText)와 별개의 수치 필드다. 미전송이면 미설정.
        @Min(value = 1, message = "목표 시간은 1분 이상이어야 합니다.")
        Integer goalMinutes,

        @Size(max = 20, message = "관심 태그는 20개까지 선택할 수 있습니다.")
        List<Long> tagIds,

        // 감지 동의 2종은 미전송(null)뿐 아니라 거부(false)도 막는다. 카메라 감지가 서비스의
        // 본체라 미동의 계정은 쓸 수 있는 기능이 없고, 화면을 우회한 직접 호출도 여기서 걸린다.
        // 가입 후 철회는 별도 정책이므로 수정(PATCH) 요청에는 이 강제를 두지 않는다.
        @NotNull(message = "자세 감지 동의 여부는 필수입니다.")
        @AssertTrue(message = "자세 감지에 동의해야 서비스를 이용할 수 있습니다.")
        Boolean postureDetectionConsent,

        @NotNull(message = "졸음 감지 동의 여부는 필수입니다.")
        @AssertTrue(message = "졸음 감지에 동의해야 서비스를 이용할 수 있습니다.")
        Boolean drowsinessDetectionConsent,

        // 화면(4단계)에는 아직 없는 항목이라 선택으로 둔다. 미전송 시 false(미동의)로 저장한다.
        Boolean postureCaptureConsent
) {
}
