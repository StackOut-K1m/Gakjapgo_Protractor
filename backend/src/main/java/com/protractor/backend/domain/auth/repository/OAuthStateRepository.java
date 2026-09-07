package com.protractor.backend.domain.auth.repository;

import java.time.Duration;
import java.util.Optional;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Repository;

// OAuth 로그인 CSRF 방어용 state 저장소. 시작 시 발급하고 콜백에서 1회용으로 검증한다.
@Repository
public class OAuthStateRepository {

    private static final String KEY_PREFIX = "oauthState:";
    private static final Duration TTL = Duration.ofMinutes(5);

    private final StringRedisTemplate redisTemplate;

    public OAuthStateRepository(StringRedisTemplate redisTemplate) {
        this.redisTemplate = redisTemplate;
    }

    public void save(String state, String provider) {
        redisTemplate.opsForValue().set(KEY_PREFIX + state, provider, TTL);
    }

    // 조회와 동시에 삭제해 재사용을 막는다.
    public Optional<String> consume(String state) {
        return Optional.ofNullable(redisTemplate.opsForValue().getAndDelete(KEY_PREFIX + state));
    }
}
