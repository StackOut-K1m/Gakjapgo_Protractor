package com.protractor.backend.domain.auth.oauth;

// 카카오/구글에서 조회한 사용자 정보를 공통 형태로 변환한 것.
public record OAuthUserInfo(
        String provider,
        String providerId,
        String email,
        String nickname,
        String profileImageUrl
) {
}
