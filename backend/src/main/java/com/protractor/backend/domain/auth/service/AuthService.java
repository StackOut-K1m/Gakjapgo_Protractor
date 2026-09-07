package com.protractor.backend.domain.auth.service;

import com.protractor.backend.domain.auth.dto.EmailCodeSendRequest;
import com.protractor.backend.domain.auth.dto.EmailVerifyRequest;
import com.protractor.backend.domain.auth.dto.LoginRequest;
import com.protractor.backend.domain.auth.dto.LoginResponse;
import com.protractor.backend.domain.auth.dto.PasswordChangeRequest;
import com.protractor.backend.domain.auth.dto.PasswordFindRequest;
import com.protractor.backend.domain.auth.dto.RefreshRequest;
import com.protractor.backend.domain.auth.dto.RefreshResponse;
import com.protractor.backend.domain.auth.dto.SignupRequest;
import com.protractor.backend.domain.auth.dto.SignupResponse;
import com.protractor.backend.domain.auth.repository.EmailVerificationRepository;
import com.protractor.backend.domain.auth.repository.PasswordFindCooldownRepository;
import com.protractor.backend.domain.auth.repository.RefreshTokenRepository;
import com.protractor.backend.domain.member.entity.Member;
import com.protractor.backend.domain.member.repository.MemberRepository;
import com.protractor.backend.global.exception.BusinessException;
import com.protractor.backend.global.mail.MailService;
import com.protractor.backend.global.security.JwtTokenProvider;
import java.security.SecureRandom;
import java.time.Duration;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class AuthService {

    private static final String TEMP_PASSWORD_LETTERS = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz";
    private static final String TEMP_PASSWORD_DIGITS = "23456789";
    private static final int TEMP_PASSWORD_LENGTH = 12;
    private static final SecureRandom RANDOM = new SecureRandom();
    private static final Duration PASSWORD_FIND_COOLDOWN = Duration.ofMinutes(5);

    private static final Duration EMAIL_CODE_TTL = Duration.ofMinutes(5);
    private static final Duration EMAIL_VERIFIED_TTL = Duration.ofMinutes(30);
    private static final Duration EMAIL_CODE_COOLDOWN = Duration.ofMinutes(1);
    private static final int EMAIL_CODE_MAX_ATTEMPTS = 5;

    private final MemberRepository memberRepository;
    private final PasswordEncoder passwordEncoder;
    private final JwtTokenProvider jwtTokenProvider;
    private final RefreshTokenRepository refreshTokenRepository;
    private final PasswordFindCooldownRepository passwordFindCooldownRepository;
    private final EmailVerificationRepository emailVerificationRepository;
    private final MailService mailService;

    // 회원가입에서 이메일 인증을 강제할지. FE 가입 화면에 인증 UI가 아직 없는 배포에서는
    // EMAIL_VERIFICATION_ENABLED=false로 꺼서 가입이 막히지 않게 한다. 발송·확인 API 자체는 항상 열려 있다.
    @Value("${app.auth.email-verification-enabled}")
    private boolean emailVerificationEnabled;

    @Transactional
    public SignupResponse signup(SignupRequest request) {
        if (!request.password().equals(request.passwordConfirm())) {
            throw new BusinessException(HttpStatus.BAD_REQUEST, "비밀번호와 비밀번호 확인이 일치하지 않습니다.");
        }

        if (memberRepository.existsByEmail(request.email())) {
            throw new BusinessException(HttpStatus.CONFLICT, "이미 사용 중인 이메일입니다.");
        }

        if (emailVerificationEnabled && !emailVerificationRepository.isVerified(request.email())) {
            throw new BusinessException(HttpStatus.FORBIDDEN, "이메일 인증이 필요합니다. 인증 코드를 요청해 완료해주세요.");
        }

        Member member = Member.builder()
                .email(request.email())
                .password(passwordEncoder.encode(request.password()))
                .nickname(request.nickname())
                .build();

        memberRepository.save(member);
        // 인증 표시는 1회용이다. 남겨두면 같은 이메일의 다음 가입(탈퇴 후 재가입)이 예전 인증을 재사용한다.
        emailVerificationRepository.consumeVerified(request.email());
        return SignupResponse.from(member);
    }

    /** 회원가입 이메일 인증 코드 발송. 무인증 엔드포인트라 쿨다운으로 반복 발송(메일 폭탄·쿼터 소진)을 막는다. */
    public void sendEmailVerificationCode(EmailCodeSendRequest request) {
        if (memberRepository.existsByEmail(request.email())) {
            throw new BusinessException(HttpStatus.CONFLICT, "이미 사용 중인 이메일입니다.");
        }

        if (!emailVerificationRepository.tryAcquireCooldown(request.email(), EMAIL_CODE_COOLDOWN)) {
            throw new BusinessException(HttpStatus.TOO_MANY_REQUESTS,
                    "인증 코드가 이미 발송되었습니다. 1분 후 다시 요청해주세요.");
        }

        String code = generateVerificationCode();
        emailVerificationRepository.saveCode(request.email(), code, EMAIL_CODE_TTL);

        try {
            mailService.sendVerificationCode(request.email(), code);
        } catch (BusinessException e) {
            // 발송 실패면 코드·쿨다운을 되돌려 사용자가 바로 다시 시도할 수 있게 한다.
            emailVerificationRepository.removeCode(request.email());
            emailVerificationRepository.releaseCooldown(request.email());
            throw e;
        }
    }

    /** 인증 코드 확인. 성공하면 30분짜리 인증 완료 표시를 남기고, 그 안에 signup이 이를 확인한다. */
    public void verifyEmailCode(EmailVerifyRequest request) {
        String saved = emailVerificationRepository.findCode(request.email());
        if (saved == null) {
            throw new BusinessException(HttpStatus.BAD_REQUEST, "인증 코드가 만료되었거나 발송된 적이 없습니다. 다시 요청해주세요.");
        }

        if (!saved.equals(request.code())) {
            // 6자리 숫자는 100만 조합이라 무제한 시도를 허용하면 무차별 대입이 가능하다. 5회에서 코드를 버린다.
            long attempts = emailVerificationRepository.incrementAttempts(request.email(), EMAIL_CODE_TTL);
            if (attempts >= EMAIL_CODE_MAX_ATTEMPTS) {
                emailVerificationRepository.removeCode(request.email());
                throw new BusinessException(HttpStatus.BAD_REQUEST, "인증 시도 횟수를 초과했습니다. 코드를 다시 요청해주세요.");
            }
            throw new BusinessException(HttpStatus.BAD_REQUEST, "인증 코드가 일치하지 않습니다.");
        }

        emailVerificationRepository.removeCode(request.email());
        emailVerificationRepository.markVerified(request.email(), EMAIL_VERIFIED_TTL);
    }

    private String generateVerificationCode() {
        return String.format("%06d", RANDOM.nextInt(1_000_000));
    }

    public LoginResponse login(LoginRequest request) {
        Member member = memberRepository.findByEmail(request.email())
                .orElseThrow(() -> new BusinessException(HttpStatus.UNAUTHORIZED, "이메일 또는 비밀번호가 올바르지 않습니다."));

        if (member.isSocial()) {
            throw new BusinessException(HttpStatus.BAD_REQUEST, "소셜 로그인으로 가입된 계정입니다. 카카오/구글 로그인을 이용해주세요.");
        }

        if (!passwordEncoder.matches(request.password(), member.getPassword())) {
            throw new BusinessException(HttpStatus.UNAUTHORIZED, "이메일 또는 비밀번호가 올바르지 않습니다.");
        }

        if (!member.isActive()) {
            throw new BusinessException(HttpStatus.FORBIDDEN, "이용할 수 없는 계정입니다.");
        }

        String accessToken = jwtTokenProvider.createAccessToken(member.getId(), member.getRole());
        String refreshToken = issueRefreshToken(member.getId());
        return LoginResponse.of(accessToken, refreshToken, member);
    }

    public RefreshResponse refresh(RefreshRequest request) {
        String refreshToken = request.refreshToken();

        if (!jwtTokenProvider.validateToken(refreshToken) || !jwtTokenProvider.isRefreshToken(refreshToken)) {
            throw new BusinessException(HttpStatus.UNAUTHORIZED, "유효하지 않은 refresh token입니다.");
        }

        Long memberId = jwtTokenProvider.getMemberId(refreshToken);

        String savedToken = refreshTokenRepository.find(memberId)
                .orElseThrow(() -> new BusinessException(HttpStatus.UNAUTHORIZED, "만료되었거나 로그아웃된 refresh token입니다."));

        // 저장된 토큰과 다르면 이미 회전(rotation)된 옛 토큰 → 탈취 가능성이 있어 세션을 통째로 무효화한다.
        if (!savedToken.equals(refreshToken)) {
            refreshTokenRepository.delete(memberId);
            throw new BusinessException(HttpStatus.UNAUTHORIZED, "refresh token이 일치하지 않습니다. 다시 로그인해주세요.");
        }

        Member member = memberRepository.findById(memberId)
                .orElseThrow(() -> new BusinessException(HttpStatus.UNAUTHORIZED, "회원을 찾을 수 없습니다."));

        if (!member.isActive()) {
            throw new BusinessException(HttpStatus.FORBIDDEN, "이용할 수 없는 계정입니다.");
        }

        String newAccessToken = jwtTokenProvider.createAccessToken(member.getId(), member.getRole());
        String newRefreshToken = issueRefreshToken(member.getId());
        return new RefreshResponse(newAccessToken, newRefreshToken);
    }

    public void logout(Long memberId) {
        refreshTokenRepository.delete(memberId);
    }

    @Transactional
    public void changePassword(Long memberId, PasswordChangeRequest request) {
        if (!request.newPassword().equals(request.newPasswordConfirm())) {
            throw new BusinessException(HttpStatus.BAD_REQUEST, "새 비밀번호와 비밀번호 확인이 일치하지 않습니다.");
        }

        Member member = memberRepository.findById(memberId)
                .orElseThrow(() -> new BusinessException(HttpStatus.NOT_FOUND, "회원을 찾을 수 없습니다."));

        if (member.isSocial()) {
            throw new BusinessException(HttpStatus.BAD_REQUEST, "소셜 로그인 계정은 비밀번호를 사용하지 않습니다.");
        }

        if (!passwordEncoder.matches(request.currentPassword(), member.getPassword())) {
            throw new BusinessException(HttpStatus.BAD_REQUEST, "현재 비밀번호가 올바르지 않습니다.");
        }

        if (request.currentPassword().equals(request.newPassword())) {
            throw new BusinessException(HttpStatus.BAD_REQUEST, "새 비밀번호가 현재 비밀번호와 같습니다.");
        }

        member.changePassword(passwordEncoder.encode(request.newPassword()));

        // 비밀번호가 바뀌면 기존 refresh token을 무효화해 다른 기기의 세션을 끊는다.
        refreshTokenRepository.delete(memberId);
    }

    @Transactional
    public void findPassword(PasswordFindRequest request) {
        Member member = memberRepository.findByEmail(request.email())
                .orElseThrow(() -> new BusinessException(HttpStatus.NOT_FOUND, "가입되지 않은 이메일입니다."));

        if (member.isSocial()) {
            throw new BusinessException(HttpStatus.BAD_REQUEST, "소셜 로그인으로 가입된 계정입니다. 카카오/구글 로그인을 이용해주세요.");
        }

        if (!member.isActive()) {
            throw new BusinessException(HttpStatus.FORBIDDEN, "이용할 수 없는 계정입니다.");
        }

        // 무인증 엔드포인트라 반복 호출로 타인 비밀번호를 계속 갈아치우는 것을 쿨다운으로 막는다.
        if (!passwordFindCooldownRepository.tryAcquire(member.getEmail(), PASSWORD_FIND_COOLDOWN)) {
            throw new BusinessException(HttpStatus.TOO_MANY_REQUESTS,
                    "임시 비밀번호가 이미 발송되었습니다. 5분 후 다시 시도해주세요.");
        }

        String tempPassword = generateTempPassword();
        member.changePassword(passwordEncoder.encode(tempPassword));

        try {
            // 발송 실패 시 예외로 트랜잭션이 롤백되어 비밀번호는 원래대로 유지된다.
            mailService.sendTempPassword(member.getEmail(), member.getNickname(), tempPassword);
        } catch (BusinessException e) {
            passwordFindCooldownRepository.release(member.getEmail());
            throw e;
        }

        refreshTokenRepository.delete(member.getId());
    }

    // 로그인 비밀번호 정책(영문+숫자 8~64자)을 반드시 만족하도록 영문/숫자 최소 1자를 보장한다.
    private String generateTempPassword() {
        String all = TEMP_PASSWORD_LETTERS + TEMP_PASSWORD_DIGITS;
        StringBuilder sb = new StringBuilder(TEMP_PASSWORD_LENGTH);
        sb.append(TEMP_PASSWORD_LETTERS.charAt(RANDOM.nextInt(TEMP_PASSWORD_LETTERS.length())));
        sb.append(TEMP_PASSWORD_DIGITS.charAt(RANDOM.nextInt(TEMP_PASSWORD_DIGITS.length())));
        for (int i = 2; i < TEMP_PASSWORD_LENGTH; i++) {
            sb.append(all.charAt(RANDOM.nextInt(all.length())));
        }
        return sb.toString();
    }

    private String issueRefreshToken(Long memberId) {
        String refreshToken = jwtTokenProvider.createRefreshToken(memberId);
        refreshTokenRepository.save(memberId, refreshToken, jwtTokenProvider.getRefreshTokenValidityMs());
        return refreshToken;
    }
}
