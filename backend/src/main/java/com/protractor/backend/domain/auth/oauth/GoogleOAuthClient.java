package com.protractor.backend.domain.auth.oauth;

import com.protractor.backend.global.exception.BusinessException;
import java.util.Map;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;
import org.springframework.util.StringUtils;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;
import org.springframework.web.util.UriComponentsBuilder;

@Slf4j
@Component
public class GoogleOAuthClient implements OAuthClient {

	private static final String AUTHORIZE_URL = "https://accounts.google.com/o/oauth2/v2/auth";
	private static final String TOKEN_URL = "https://oauth2.googleapis.com/token";
	private static final String USER_INFO_URL = "https://www.googleapis.com/oauth2/v3/userinfo";

	private final RestClient restClient;
	private final String clientId;
	private final String clientSecret;
	private final String redirectUri;

	public GoogleOAuthClient(RestClient oauthRestClient, @Value("${oauth.google.client-id}") String clientId,
			@Value("${oauth.google.client-secret}") String clientSecret,
			@Value("${oauth.google.redirect-uri}") String redirectUri) {
		this.restClient = oauthRestClient;
		this.clientId = clientId;
		this.clientSecret = clientSecret;
		this.redirectUri = redirectUri;
	}

	@Override
	public String provider() {
		return "google";
	}

	@Override
	public String buildAuthorizeUrl(String state) {
		// 키 미주입 서버에서 빈 client_id로 넘기면 사용자가 구글의 "400 오류: invalid_request" 페이지를 본다.
		// 로컬은 키가 없는 게 정상(소셜은 배포 환경에서만)이라 부팅은 막지 않고, 시작 시점에 우리 메시지로 거절한다.
		if (!StringUtils.hasText(clientId)) {
			throw new BusinessException(HttpStatus.SERVICE_UNAVAILABLE, "구글 로그인이 설정되지 않은 서버입니다.");
		}
		// scope의 공백 등은 인코딩하지 않으면 URI 생성 시 예외가 난다.
		return UriComponentsBuilder.fromUriString(AUTHORIZE_URL).queryParam("client_id", clientId)
				.queryParam("redirect_uri", redirectUri).queryParam("response_type", "code")
				.queryParam("scope", "openid email profile").queryParam("state", state).encode().build().toUriString();
	}

	@Override
	public OAuthUserInfo fetchUser(String code) {
		try {
			MultiValueMap<String, String> form = new LinkedMultiValueMap<>();
			form.add("grant_type", "authorization_code");
			form.add("client_id", clientId);
			form.add("client_secret", clientSecret);
			form.add("redirect_uri", redirectUri);
			form.add("code", code);

			Map<String, Object> tokenResponse = restClient.post().uri(TOKEN_URL)
					.contentType(MediaType.APPLICATION_FORM_URLENCODED).body(form).retrieve().body(Map.class);

			String accessToken = (String) tokenResponse.get("access_token");

			Map<String, Object> user = restClient.get().uri(USER_INFO_URL)
					.header("Authorization", "Bearer " + accessToken).retrieve().body(Map.class);

			// sub가 없으면 provider_id가 NULL로 저장되는데, SQL에서 NULL은 어떤 조회와도 일치하지 않아
			// 다음 로그인에서 기존 회원을 못 찾는다(로그인마다 새 계정 생성 또는 이메일 409). 여기서 끊는다.
			if (user == null || user.get("sub") == null) {
				log.error("구글 사용자 응답에 sub가 없습니다. keys={}", user == null ? null : user.keySet());
				throw new BusinessException(HttpStatus.UNAUTHORIZED, "구글 로그인에 실패했습니다.");
			}
			String providerId = (String) user.get("sub");
			String email = (String) user.get("email");
			String nickname = (String) user.getOrDefault("name", "구글사용자");
			String profileImageUrl = (String) user.get("picture");

			return new OAuthUserInfo(provider(), providerId, email, nickname, profileImageUrl);
		} catch (RestClientException e) {
			log.error("구글 OAuth 사용자 조회 실패", e);
			throw new BusinessException(HttpStatus.UNAUTHORIZED, "구글 로그인에 실패했습니다.");
		}
	}
}
