package com.protractor.backend.domain.auth.repository;

import java.time.Duration;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Repository;

// 비밀번호 찾기 반복 호출(타인 계정 괴롭힘, 메일 쿼터 소진)을 막는 이메일별 쿨다운.
@Repository
public class PasswordFindCooldownRepository {

    private static final String KEY_PREFIX = "passwordFindCooldown:";

    private final StringRedisTemplate redisTemplate;

    public PasswordFindCooldownRepository(StringRedisTemplate redisTemplate) {
        this.redisTemplate = redisTemplate;
    }

    // setIfAbsent(SETNX)라 동시 요청이 몰려도 한 건만 통과한다.
    public boolean tryAcquire(String email, Duration cooldown) {
        return Boolean.TRUE.equals(
                redisTemplate.opsForValue().setIfAbsent(KEY_PREFIX + email, "1", cooldown));
    }

    // 메일 발송 실패 시 쿨다운을 되돌려 정상 사용자의 재시도를 막지 않는다.
    public void release(String email) {
        redisTemplate.delete(KEY_PREFIX + email);
    }
}
