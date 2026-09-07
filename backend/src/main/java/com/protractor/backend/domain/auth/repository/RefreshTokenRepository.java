package com.protractor.backend.domain.auth.repository;

import java.time.Duration;
import java.util.Optional;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Repository;

// 회원당 refresh token 1개를 Redis에 보관한다. TTL이 지나면 자동 삭제된다.
@Repository
public class RefreshTokenRepository {

    private static final String KEY_PREFIX = "refreshToken:";

    private final StringRedisTemplate redisTemplate;

    public RefreshTokenRepository(StringRedisTemplate redisTemplate) {
        this.redisTemplate = redisTemplate;
    }

    public void save(Long memberId, String refreshToken, long validityMs) {
        redisTemplate.opsForValue()
                .set(KEY_PREFIX + memberId, refreshToken, Duration.ofMillis(validityMs));
    }

    public Optional<String> find(Long memberId) {
        return Optional.ofNullable(redisTemplate.opsForValue().get(KEY_PREFIX + memberId));
    }

    public void delete(Long memberId) {
        redisTemplate.delete(KEY_PREFIX + memberId);
    }
}
