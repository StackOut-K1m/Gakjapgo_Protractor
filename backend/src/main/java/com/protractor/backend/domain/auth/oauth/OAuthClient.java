package com.protractor.backend.domain.auth.oauth;

public interface OAuthClient {

    // "kakao", "google" — URL 경로변수와 매칭되는 식별자
    String provider();

    // 사용자를 보낼 소셜 로그인 페이지 URL. state는 콜백에서 CSRF 검증에 쓰인다.
    String buildAuthorizeUrl(String state);

    // 콜백으로 받은 인가 코드로 토큰을 교환하고 사용자 정보를 조회한다.
    OAuthUserInfo fetchUser(String code);
}
