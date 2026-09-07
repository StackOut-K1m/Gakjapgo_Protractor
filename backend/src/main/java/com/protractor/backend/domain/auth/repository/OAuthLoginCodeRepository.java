package com.protractor.backend.domain.auth.repository;

import java.time.Duration;
import java.util.Optional;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Repository;

// 소셜 로그인 성공 시 토큰 대신 브라우저로 전달하는 일회용 코드 저장소.
// 토큰을 URL에 직접 실으면 브라우저 방문기록에 남기 때문에, 코드만 넘기고
// 프론트가 POST /api/v1/auth/oauth/exchange 로 토큰을 교환한다.
@Repository
public class OAuthLoginCodeRepository {

    private static final String KEY_PREFIX = "oauthLoginCode:";
    private static final Duration TTL = Duration.ofMinutes(3);

    private final StringRedisTemplate redisTemplate;

    public OAuthLoginCodeRepository(StringRedisTemplate redisTemplate) {
        this.redisTemplate = redisTemplate;
    }

    public void save(String loginCode, Long memberId) {
        redisTemplate.opsForValue().set(KEY_PREFIX + loginCode, String.valueOf(memberId), TTL);
    }

    // 조회와 동시에 삭제해 코드 재사용을 막는다.
    public Optional<Long> consume(String loginCode) {
        return Optional.ofNullable(redisTemplate.opsForValue().getAndDelete(KEY_PREFIX + loginCode))
                .map(Long::parseLong);
    }
}
