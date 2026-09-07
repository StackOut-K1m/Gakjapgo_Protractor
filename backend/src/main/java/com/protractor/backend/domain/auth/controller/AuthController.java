package com.protractor.backend.domain.auth.controller;

import com.protractor.backend.domain.auth.dto.LoginRequest;
import com.protractor.backend.domain.auth.dto.LoginResponse;
import com.protractor.backend.domain.auth.dto.EmailCodeSendRequest;
import com.protractor.backend.domain.auth.dto.EmailVerifyRequest;
import com.protractor.backend.domain.auth.dto.MessageResponse;
import com.protractor.backend.domain.auth.dto.OAuthExchangeRequest;
import com.protractor.backend.domain.auth.dto.PasswordChangeRequest;
import com.protractor.backend.domain.auth.dto.PasswordFindRequest;
import com.protractor.backend.domain.auth.dto.RefreshRequest;
import com.protractor.backend.domain.auth.dto.RefreshResponse;
import com.protractor.backend.domain.auth.dto.SignupRequest;
import com.protractor.backend.domain.auth.dto.SignupResponse;
import com.protractor.backend.domain.auth.service.AuthService;
import com.protractor.backend.domain.auth.service.OAuthService;
import com.protractor.backend.global.exception.BusinessException;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import java.net.URI;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.util.StringUtils;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@Slf4j
@Tag(name = "Auth", description = "회원가입 / 로그인 API")
@RestController
@RequestMapping("/api/v1/auth")
@RequiredArgsConstructor
public class AuthController {

    private final AuthService authService;
    private final OAuthService oAuthService;

    // 소셜 로그인 완료/실패 후 브라우저를 돌려보낼 프론트엔드 페이지
    @Value("${app.oauth.frontend-callback-url}")
    private String frontendCallbackUrl;

    @Operation(summary = "회원가입 이메일 인증 코드 발송 (6자리, 5분 유효, 재발송 1분 쿨다운)")
    @PostMapping("/email/verification-code")
    public ResponseEntity<MessageResponse> sendEmailVerificationCode(
            @Valid @RequestBody EmailCodeSendRequest request) {
        authService.sendEmailVerificationCode(request);
        return ResponseEntity.ok(new MessageResponse("인증 코드가 발송되었습니다. 메일함을 확인해주세요."));
    }

    @Operation(summary = "이메일 인증 코드 확인 (성공 후 30분 안에 회원가입 완료)")
    @PostMapping("/email/verify")
    public ResponseEntity<MessageResponse> verifyEmailCode(@Valid @RequestBody EmailVerifyRequest request) {
        authService.verifyEmailCode(request);
        return ResponseEntity.ok(new MessageResponse("이메일 인증이 완료되었습니다."));
    }

    @Operation(summary = "회원가입 (이메일 인증 완료 상태에서만 가능)")
    @PostMapping("/signup")
    public ResponseEntity<SignupResponse> signup(@Valid @RequestBody SignupRequest request) {
        SignupResponse response = authService.signup(request);
        return ResponseEntity.status(HttpStatus.CREATED).body(response);
    }

    @Operation(summary = "로그인")
    @PostMapping("/login")
    public ResponseEntity<LoginResponse> login(@Valid @RequestBody LoginRequest request) {
        LoginResponse response = authService.login(request);
        return ResponseEntity.ok(response);
    }

    @Operation(summary = "토큰 재발급")
    @PostMapping("/refresh")
    public ResponseEntity<RefreshResponse> refresh(@Valid @RequestBody RefreshRequest request) {
        RefreshResponse response = authService.refresh(request);
        return ResponseEntity.ok(response);
    }

    @Operation(summary = "로그아웃")
    @PostMapping("/logout")
    public ResponseEntity<MessageResponse> logout(Authentication authentication) {
        Long memberId = (Long) authentication.getPrincipal();
        authService.logout(memberId);
        return ResponseEntity.ok(new MessageResponse("로그아웃 되었습니다."));
    }

    @Operation(summary = "소셜 로그인 시작 (카카오/구글 로그인 페이지로 리다이렉트)")
    @GetMapping("/oauth/{provider}")
    public ResponseEntity<Void> startOAuth(@PathVariable String provider) {
        return ResponseEntity.status(HttpStatus.FOUND)
                .location(URI.create(oAuthService.authorizeUrl(provider)))
                .build();
    }

    @Operation(summary = "소셜 로그인 콜백 (일회용 코드 발급 후 프론트로 리다이렉트)")
    @GetMapping("/oauth/{provider}/callback")
    public ResponseEntity<Void> oauthCallback(
            @PathVariable String provider,
            @RequestParam(required = false) String code,
            @RequestParam(required = false) String state,
            @RequestParam(required = false) String error
    ) {
        // 사용자가 소셜 로그인 화면에서 취소한 경우 code 없이 error만 온다.
        if (StringUtils.hasText(error) || !StringUtils.hasText(code)) {
            return redirectToFrontend("error=" + encode("소셜 로그인이 취소되었습니다."));
        }

        try {
            oAuthService.validateState(provider, state);
            // 브라우저 방문기록에 토큰이 남지 않도록 일회용 코드만 전달한다.
            // 프론트는 POST /api/v1/auth/oauth/exchange 로 토큰을 교환한다.
            String loginCode = oAuthService.loginAndIssueCode(provider, code);
            return redirectToFrontend("code=" + loginCode);
        } catch (BusinessException e) {
            return redirectToFrontend("error=" + encode(e.getMessage()));
        } catch (Exception e) {
            // 콜백은 브라우저가 직접 여는 주소라, 어떤 실패든 raw JSON 대신 프론트로 돌려보낸다.
            log.error("소셜 로그인 콜백 처리 실패: provider={}", provider, e);
            return redirectToFrontend("error=" + encode("소셜 로그인에 실패했습니다. 다시 시도해주세요."));
        }
    }

    @Operation(summary = "소셜 로그인 토큰 교환 (일회용 코드 → 토큰)")
    @PostMapping("/oauth/exchange")
    public ResponseEntity<LoginResponse> exchangeOAuthLoginCode(
            @Valid @RequestBody OAuthExchangeRequest request
    ) {
        return ResponseEntity.ok(oAuthService.exchangeLoginCode(request.code()));
    }

    private ResponseEntity<Void> redirectToFrontend(String fragment) {
        return ResponseEntity.status(HttpStatus.FOUND)
                .location(URI.create(frontendCallbackUrl + "#" + fragment))
                .build();
    }

    private static String encode(String value) {
        return URLEncoder.encode(value, StandardCharsets.UTF_8);
    }

    @Operation(summary = "비밀번호 찾기 (임시 비밀번호 메일 발송)")
    @PostMapping("/password/find")
    public ResponseEntity<MessageResponse> findPassword(@Valid @RequestBody PasswordFindRequest request) {
        authService.findPassword(request);
        return ResponseEntity.ok(new MessageResponse("임시 비밀번호를 이메일로 발송했습니다."));
    }

    @Operation(summary = "비밀번호 변경")
    @PatchMapping("/password")
    public ResponseEntity<MessageResponse> changePassword(
            Authentication authentication,
            @Valid @RequestBody PasswordChangeRequest request
    ) {
        Long memberId = (Long) authentication.getPrincipal();
        authService.changePassword(memberId, request);
        return ResponseEntity.ok(new MessageResponse("비밀번호가 변경되었습니다."));
    }
}
