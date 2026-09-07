package com.protractor.backend.domain.auth.dto;

public record RefreshResponse(
        String accessToken,
        String refreshToken
) {
}
