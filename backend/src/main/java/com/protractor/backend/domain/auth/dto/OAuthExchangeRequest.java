package com.protractor.backend.domain.auth.dto;

import jakarta.validation.constraints.NotBlank;

public record OAuthExchangeRequest(
        @NotBlank(message = "로그인 코드는 필수입니다.")
        String code
) {
}
