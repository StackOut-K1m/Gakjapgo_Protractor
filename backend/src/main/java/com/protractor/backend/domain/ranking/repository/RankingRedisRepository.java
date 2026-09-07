package com.protractor.backend.domain.ranking.repository;

import com.protractor.backend.domain.ranking.RankingWindow;
import com.protractor.backend.domain.ranking.dto.RankingSnapshotMetadata;
import com.protractor.backend.domain.ranking.dto.RankingSourceRow;
import java.time.Duration;
import java.time.LocalDateTime;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;
import lombok.RequiredArgsConstructor;
import org.springframework.data.redis.core.DefaultTypedTuple;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.ZSetOperations;
import org.springframework.stereotype.Repository;

/**
 * 랭킹은 DB 정본을 복제한 Redis 읽기 캐시다. 동점은 Redis ZSET의 회원 ID 역순으로 결정된다.
 * 순공 시간은 바꾸지 않지만 동점자가 서로 다른 순위로 보이는 정책 리스크가 있어 추후 공동 순위로 교체할 수 있다.
 */
@Repository
@RequiredArgsConstructor
public class RankingRedisRepository {

    private static final String PREFIX = "ranking:study-time:";
    private final StringRedisTemplate redisTemplate;

    public boolean hasSnapshot(RankingWindow window) {
        return Boolean.TRUE.equals(redisTemplate.hasKey(metaKey(window)));
    }

    public void save(RankingWindow window, List<RankingSourceRow> rows, LocalDateTime calculatedAt) {
        String key = rankingKey(window);
        String metaKey = metaKey(window);
        String suffix = ":build:" + UUID.randomUUID();
        String temporaryKey = key + suffix;
        String temporaryMetaKey = metaKey + suffix;
        Duration ttl = ttlOf(window);

        if (!rows.isEmpty()) {
            Set<ZSetOperations.TypedTuple<String>> tuples = rows.stream()
                    .map(row -> new DefaultTypedTuple<>(memberToken(row.memberId()), row.focusedSeconds().doubleValue()))
                    .collect(Collectors.toSet());
            redisTemplate.opsForZSet().add(temporaryKey, tuples);
            redisTemplate.expire(temporaryKey, ttl);
        }

        Map<String, String> metadata = new LinkedHashMap<>();
        metadata.put("calculatedAt", calculatedAt.toString());
        metadata.put("periodStart", window.startAt().toString());
        metadata.put("periodEnd", window.endAt().toString());
        metadata.put("totalMembers", String.valueOf(rows.size()));
        redisTemplate.opsForHash().putAll(temporaryMetaKey, metadata);
        redisTemplate.expire(temporaryMetaKey, ttl);

        // 임시 키를 완성한 뒤 교체하므로, ZSET이 채워지는 중간 상태는 외부에 보이지 않는다.
        redisTemplate.delete(key);
        if (!rows.isEmpty()) {
            redisTemplate.rename(temporaryKey, key);
        }
        redisTemplate.delete(metaKey);
        redisTemplate.rename(temporaryMetaKey, metaKey);
    }

    public RankingSnapshotMetadata metadata(RankingWindow window) {
        Map<Object, Object> values = redisTemplate.opsForHash().entries(metaKey(window));
        if (values.isEmpty()) {
            return null;
        }
        return new RankingSnapshotMetadata(
                LocalDateTime.parse((String) values.get("calculatedAt")),
                LocalDateTime.parse((String) values.get("periodStart")),
                LocalDateTime.parse((String) values.get("periodEnd")),
                Long.parseLong((String) values.get("totalMembers")));
    }

    public List<RankingScore> findRange(RankingWindow window, long start, long end) {
        Set<ZSetOperations.TypedTuple<String>> tuples = redisTemplate.opsForZSet()
                .reverseRangeWithScores(rankingKey(window), start, end);
        if (tuples == null) {
            return List.of();
        }
        return tuples.stream().map(tuple -> new RankingScore(memberId(tuple.getValue()), tuple.getScore().longValue()))
                .toList();
    }

    public Long findRank(RankingWindow window, Long memberId) {
        return redisTemplate.opsForZSet().reverseRank(rankingKey(window), memberToken(memberId));
    }

    public Double findScore(RankingWindow window, Long memberId) {
        return redisTemplate.opsForZSet().score(rankingKey(window), memberToken(memberId));
    }

    public long count(RankingWindow window) {
        Long count = redisTemplate.opsForZSet().zCard(rankingKey(window));
        return count == null ? 0L : count;
    }

    private String rankingKey(RankingWindow window) {
        return PREFIX + window.period().name().toLowerCase() + ':' + window.cacheToken();
    }

    private String metaKey(RankingWindow window) {
        return rankingKey(window) + ":meta";
    }

    private Duration ttlOf(RankingWindow window) {
        return switch (window.period()) {
            case YESTERDAY -> Duration.ofDays(3);
            case WEEK -> Duration.ofDays(16);
            case MONTH -> Duration.ofDays(62);
        };
    }

    private String memberToken(Long memberId) {
        return String.format("%019d", memberId);
    }

    private Long memberId(String token) {
        return Long.parseLong(token);
    }

    public record RankingScore(Long memberId, long focusedSeconds) {
    }
}
