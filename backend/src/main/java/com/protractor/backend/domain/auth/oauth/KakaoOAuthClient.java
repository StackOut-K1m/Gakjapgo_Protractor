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
public class KakaoOAuthClient implements OAuthClient {

	private static final String AUTHORIZE_URL = "https://kauth.kakao.com/oauth/authorize";
	private static final String TOKEN_URL = "https://kauth.kakao.com/oauth/token";
	private static final String USER_INFO_URL = "https://kapi.kakao.com/v2/user/me";

	private final RestClient restClient;
	private final String clientId;
	private final String clientSecret;
	private final String redirectUri;

	public KakaoOAuthClient(RestClient oauthRestClient, @Value("${oauth.kakao.client-id}") String clientId,
			@Value("${oauth.kakao.client-secret}") String clientSecret,
			@Value("${oauth.kakao.redirect-uri}") String redirectUri) {
		this.restClient = oauthRestClient;
		this.clientId = clientId;
		this.clientSecret = clientSecret;
		this.redirectUri = redirectUri;
	}

	@Override
	public String provider() {
		return "kakao";
	}

	@Override
	public String buildAuthorizeUrl(String state) {
		// 키 미주입 서버에서 빈 client_id로 넘기면 사용자가 카카오의 KOE101 에러 페이지를 본다.
		// 로컬은 키가 없는 게 정상(소셜은 배포 환경에서만)이라 부팅은 막지 않고, 시작 시점에 우리 메시지로 거절한다.
		if (!StringUtils.hasText(clientId)) {
			throw new BusinessException(HttpStatus.SERVICE_UNAVAILABLE, "카카오 로그인이 설정되지 않은 서버입니다.");
		}
		return UriComponentsBuilder.fromUriString(AUTHORIZE_URL).queryParam("client_id", clientId)
				.queryParam("redirect_uri", redirectUri).queryParam("response_type", "code").queryParam("state", state)
				.encode().build().toUriString();
	}

	@Override
	@SuppressWarnings("unchecked")
	public OAuthUserInfo fetchUser(String code) {
		try {
			MultiValueMap<String, String> form = new LinkedMultiValueMap<>();
			form.add("grant_type", "authorization_code");
			form.add("client_id", clientId);
			form.add("redirect_uri", redirectUri);
			form.add("code", code);
			// 카카오 콘솔에서 client secret을 활성화하지 않았다면 빈 값이므로 보내지 않는다.
			if (StringUtils.hasText(clientSecret)) {
				form.add("client_secret", clientSecret);
			}

			Map<String, Object> tokenResponse = restClient.post().uri(TOKEN_URL)
					.contentType(MediaType.APPLICATION_FORM_URLENCODED).body(form).retrieve().body(Map.class);

			String accessToken = (String) tokenResponse.get("access_token");

			Map<String, Object> user = restClient.get().uri(USER_INFO_URL)
					.header("Authorization", "Bearer " + accessToken).retrieve().body(Map.class);

			// 200 응답이어도 id가 없으면 String.valueOf가 "null" 문자열을 만들어, 같은 상황의 다른 사용자와
			// provider_id='null' 계정 하나로 뒤섞인다(남의 계정 로그인). 식별자 없는 응답은 여기서 끊는다.
			if (user == null || user.get("id") == null) {
				log.error("카카오 사용자 응답에 id가 없습니다. keys={}", user == null ? null : user.keySet());
				throw new BusinessException(HttpStatus.UNAUTHORIZED, "카카오 로그인에 실패했습니다.");
			}
			String providerId = String.valueOf(user.get("id"));
			Map<String, Object> account = (Map<String, Object>) user.getOrDefault("kakao_account", Map.of());
			Map<String, Object> profile = (Map<String, Object>) account.getOrDefault("profile", Map.of());

			// 이메일은 카카오 동의항목 설정에 따라 없을 수 있다(null 허용, DB도 NULL 허용).
			String email = (String) account.get("email");
			String nickname = (String) profile.getOrDefault("nickname", "카카오사용자");
			String profileImageUrl = (String) profile.get("profile_image_url");

			return new OAuthUserInfo(provider(), providerId, email, nickname, profileImageUrl);
		} catch (RestClientException e) {
			log.error("카카오 OAuth 사용자 조회 실패", e);
			throw new BusinessException(HttpStatus.UNAUTHORIZED, "카카오 로그인에 실패했습니다.");
		}
	}
}
