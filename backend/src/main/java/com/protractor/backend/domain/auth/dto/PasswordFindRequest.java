package com.protractor.backend.domain.auth.dto;

import jakarta.validation.constraints.NotBlank;

public record PasswordFindRequest(
        @NotBlank(message = "이메일은 필수입니다.")
        String email
) {
}
