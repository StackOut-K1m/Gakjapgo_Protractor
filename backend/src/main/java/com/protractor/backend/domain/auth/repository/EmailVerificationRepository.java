package com.protractor.backend.domain.auth.repository;

import java.time.Duration;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Repository;

/**
 * 회원가입 이메일 인증 상태 저장소. 코드·시도 횟수·인증 완료 표시를 전부 Redis TTL로 관리해
 * 만료 처리를 따로 만들 필요가 없다.
 *
 * <p>
 * 키 3종: code(발송한 6자리, 5분) / attempts(오답 횟수, 코드와 같이 소멸) / verified(인증 완료 표시, 30분 —
 * 이 안에 회원가입을 마치면 된다).
 */
@Repository
public class EmailVerificationRepository {

    private static final String CODE_PREFIX = "emailVerification:code:";
    private static final String ATTEMPTS_PREFIX = "emailVerification:attempts:";
    private static final String VERIFIED_PREFIX = "emailVerification:verified:";
    private static final String COOLDOWN_PREFIX = "emailVerification:cooldown:";

    private final StringRedisTemplate redisTemplate;

    public EmailVerificationRepository(StringRedisTemplate redisTemplate) {
        this.redisTemplate = redisTemplate;
    }

    /** 새 코드 저장. 재발송이면 이전 코드·오답 횟수를 함께 버린다(이전 코드로 인증되는 혼란 방지). */
    public void saveCode(String email, String code, Duration ttl) {
        redisTemplate.opsForValue().set(CODE_PREFIX + email, code, ttl);
        redisTemplate.delete(ATTEMPTS_PREFIX + email);
    }

    /** 저장된 코드. 만료됐거나 발송한 적 없으면 null. */
    public String findCode(String email) {
        return redisTemplate.opsForValue().get(CODE_PREFIX + email);
    }

    public void removeCode(String email) {
        redisTemplate.delete(CODE_PREFIX + email);
        redisTemplate.delete(ATTEMPTS_PREFIX + email);
    }

    /** 오답 1회 기록 후 누적 횟수 반환. 코드와 같은 시점에 만료되도록 TTL을 맞춘다. */
    public long incrementAttempts(String email, Duration ttl) {
        Long attempts = redisTemplate.opsForValue().increment(ATTEMPTS_PREFIX + email);
        redisTemplate.expire(ATTEMPTS_PREFIX + email, ttl);
        return attempts == null ? 0 : attempts;
    }

    public void markVerified(String email, Duration ttl) {
        redisTemplate.opsForValue().set(VERIFIED_PREFIX + email, "1", ttl);
    }

    public boolean isVerified(String email) {
        return redisTemplate.hasKey(VERIFIED_PREFIX + email);
    }

    /** 가입 완료 후 인증 표시를 지운다. 남겨두면 탈퇴 후 재가입 등에서 예전 인증이 재사용된다. */
    public void consumeVerified(String email) {
        redisTemplate.delete(VERIFIED_PREFIX + email);
    }

    // setIfAbsent(SETNX)라 동시 요청이 몰려도 한 건만 통과한다(비밀번호 찾기 쿨다운과 같은 방식).
    public boolean tryAcquireCooldown(String email, Duration cooldown) {
        return Boolean.TRUE.equals(
                redisTemplate.opsForValue().setIfAbsent(COOLDOWN_PREFIX + email, "1", cooldown));
    }

    // 메일 발송 실패 시 쿨다운을 되돌려 정상 사용자의 재시도를 막지 않는다.
    public void releaseCooldown(String email) {
        redisTemplate.delete(COOLDOWN_PREFIX + email);
    }
}
