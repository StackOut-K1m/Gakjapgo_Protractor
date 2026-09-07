package com.protractor.backend.domain.auth.service;

import com.protractor.backend.domain.auth.dto.LoginResponse;
import com.protractor.backend.domain.auth.oauth.OAuthClient;
import com.protractor.backend.domain.auth.oauth.OAuthUserInfo;
import com.protractor.backend.domain.auth.repository.OAuthLoginCodeRepository;
import com.protractor.backend.domain.auth.repository.OAuthStateRepository;
import com.protractor.backend.domain.auth.repository.RefreshTokenRepository;
import com.protractor.backend.domain.member.entity.Member;
import com.protractor.backend.domain.member.entity.Provider;
import com.protractor.backend.domain.member.repository.MemberRepository;
import com.protractor.backend.global.exception.BusinessException;
import com.protractor.backend.global.security.JwtTokenProvider;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

// 외부 HTTP 호출(fetchUser)이 포함되므로 클래스/메서드 단위 트랜잭션을 걸지 않는다.
// DB 작업은 리포지토리 호출 단위의 짧은 트랜잭션으로 처리되고, 동시 가입 충돌은 유니크 제약이 막는다.
@Service
public class OAuthService {

    private final Map<String, OAuthClient> clients;
    private final MemberRepository memberRepository;
    private final JwtTokenProvider jwtTokenProvider;
    private final RefreshTokenRepository refreshTokenRepository;
    private final OAuthStateRepository oAuthStateRepository;
    private final OAuthLoginCodeRepository oAuthLoginCodeRepository;

    public OAuthService(
            List<OAuthClient> clientList,
            MemberRepository memberRepository,
            JwtTokenProvider jwtTokenProvider,
            RefreshTokenRepository refreshTokenRepository,
            OAuthStateRepository oAuthStateRepository,
            OAuthLoginCodeRepository oAuthLoginCodeRepository
    ) {
        this.clients = clientList.stream()
                .collect(Collectors.toMap(OAuthClient::provider, Function.identity()));
        this.memberRepository = memberRepository;
        this.jwtTokenProvider = jwtTokenProvider;
        this.refreshTokenRepository = refreshTokenRepository;
        this.oAuthStateRepository = oAuthStateRepository;
        this.oAuthLoginCodeRepository = oAuthLoginCodeRepository;
    }

    // 시작 시 state를 발급해 Redis에 기록하고 인가 URL에 포함시킨다. 콜백에서 1회용으로 검증된다(로그인 CSRF 방어).
    public String authorizeUrl(String provider) {
        OAuthClient client = resolveClient(provider);
        String state = UUID.randomUUID().toString();
        oAuthStateRepository.save(state, provider);
        return client.buildAuthorizeUrl(state);
    }

    public void validateState(String provider, String state) {
        String savedProvider = StringUtils.hasText(state)
                ? oAuthStateRepository.consume(state).orElse(null)
                : null;
        if (savedProvider == null || !savedProvider.equals(provider)) {
            throw new BusinessException(HttpStatus.UNAUTHORIZED,
                    "소셜 로그인 요청이 만료되었거나 올바르지 않습니다. 다시 시도해주세요.");
        }
    }

    // 소셜 인증을 완료하고 일회용 로그인 코드를 발급한다. 토큰은 exchange 단계에서 발급된다.
    public String loginAndIssueCode(String providerName, String code) {
        OAuthUserInfo userInfo = resolveClient(providerName).fetchUser(code);
        Provider provider = Provider.valueOf(providerName.toUpperCase());

        Member member = memberRepository.findByProviderAndProviderId(provider, userInfo.providerId())
                .orElseGet(() -> signupSocialMember(provider, userInfo));

        if (!member.isActive()) {
            throw new BusinessException(HttpStatus.FORBIDDEN, "이용할 수 없는 계정입니다.");
        }

        String loginCode = UUID.randomUUID().toString();
        oAuthLoginCodeRepository.save(loginCode, member.getId());
        return loginCode;
    }

    // 일회용 코드를 실제 토큰으로 교환한다. 코드가 이 시점에 소모되므로 재사용이 불가능하다.
    public LoginResponse exchangeLoginCode(String loginCode) {
        Long memberId = oAuthLoginCodeRepository.consume(loginCode)
                .orElseThrow(() -> new BusinessException(HttpStatus.UNAUTHORIZED,
                        "만료되었거나 이미 사용된 로그인 코드입니다. 다시 로그인해주세요."));

        Member member = memberRepository.findById(memberId)
                .orElseThrow(() -> new BusinessException(HttpStatus.UNAUTHORIZED, "회원을 찾을 수 없습니다."));

        if (!member.isActive()) {
            throw new BusinessException(HttpStatus.FORBIDDEN, "이용할 수 없는 계정입니다.");
        }

        String accessToken = jwtTokenProvider.createAccessToken(member.getId(), member.getRole());
        String refreshToken = jwtTokenProvider.createRefreshToken(member.getId());
        refreshTokenRepository.save(member.getId(), refreshToken, jwtTokenProvider.getRefreshTokenValidityMs());

        return LoginResponse.of(accessToken, refreshToken, member);
    }

    private Member signupSocialMember(Provider provider, OAuthUserInfo userInfo) {
        // 같은 이메일의 일반(또는 타 소셜) 계정이 이미 있으면 별도 계정을 만들지 않고 안내한다.
        if (StringUtils.hasText(userInfo.email()) && memberRepository.existsByEmail(userInfo.email())) {
            throw new BusinessException(HttpStatus.CONFLICT,
                    "이미 해당 이메일로 가입된 계정이 있습니다. 기존 방식으로 로그인해주세요.");
        }

        // 소셜 가입자는 password가 없다(NULL). 폼 로그인/비밀번호 변경은 서비스단에서 차단된다.
        return memberRepository.save(Member.builder()
                .email(StringUtils.hasText(userInfo.email()) ? userInfo.email() : null)
                .nickname(userInfo.nickname())
                .profileImageUrl(userInfo.profileImageUrl())
                .provider(provider)
                .providerId(userInfo.providerId())
                .build());
    }

    private OAuthClient resolveClient(String provider) {
        OAuthClient client = clients.get(provider);
        if (client == null) {
            throw new BusinessException(HttpStatus.NOT_FOUND, "지원하지 않는 소셜 로그인입니다: " + provider);
        }
        return client;
    }
}
