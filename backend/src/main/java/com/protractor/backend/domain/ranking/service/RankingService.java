package com.protractor.backend.domain.ranking.service;

import com.protractor.backend.domain.member.entity.AccountStatus;
import com.protractor.backend.domain.member.entity.Member;
import com.protractor.backend.domain.member.repository.MemberRepository;
import com.protractor.backend.domain.ranking.RankingPeriod;
import com.protractor.backend.domain.ranking.RankingWindow;
import com.protractor.backend.domain.ranking.dto.MyRankingResponse;
import com.protractor.backend.domain.ranking.dto.RankingEntryResponse;
import com.protractor.backend.domain.ranking.dto.RankingPageResponse;
import com.protractor.backend.domain.ranking.dto.RankingPreviewResponse;
import com.protractor.backend.domain.ranking.dto.RankingSnapshotMetadata;
import com.protractor.backend.domain.ranking.dto.RankingSourceRow;
import com.protractor.backend.domain.ranking.repository.RankingQueryRepository;
import com.protractor.backend.domain.ranking.repository.RankingRedisRepository;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDateTime;
import java.util.Collection;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;
import lombok.RequiredArgsConstructor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataAccessException;
import org.springframework.stereotype.Service;

@Service
@RequiredArgsConstructor
public class RankingService {

    private static final Logger log = LoggerFactory.getLogger(RankingService.class);
    private static final int PREVIEW_SIZE = 10;
    private final RankingQueryRepository rankingQueryRepository;
    private final RankingRedisRepository rankingRedisRepository;
    private final MemberRepository memberRepository;

    public RankingPreviewResponse getPreview(RankingPeriod period) {
        RankingWindow window = RankingWindow.current(period);
        RankingSnapshotMetadata metadata = ensureSnapshot(window);
        return new RankingPreviewResponse(toEntries(window, rankingRedisRepository.findRange(window, 0, PREVIEW_SIZE - 1), 1),
                metadata.calculatedAt(), metadata.periodStart(), metadata.periodEnd());
    }

    public RankingPageResponse getRankings(RankingPeriod period, int requestedPage, int requestedSize) {
        RankingWindow window = RankingWindow.current(period);
        RankingSnapshotMetadata metadata = ensureSnapshot(window);
        int page = Math.max(requestedPage, 0);
        int size = Math.min(Math.max(requestedSize, 1), 100);
        long total = rankingRedisRepository.count(window);
        long start = (long) page * size;
        List<RankingEntryResponse> rankings = start >= total ? List.of()
                : toEntries(window, rankingRedisRepository.findRange(window, start, start + size - 1), start + 1);
        int totalPages = total == 0 ? 0 : (int) Math.ceil((double) total / size);
        return new RankingPageResponse(rankings, page, size, total, totalPages, metadata.calculatedAt(),
                metadata.periodStart(), metadata.periodEnd());
    }

    public MyRankingResponse getMyRanking(RankingPeriod period, Long memberId) {
        RankingWindow window = RankingWindow.current(period);
        RankingSnapshotMetadata metadata = ensureSnapshot(window);
        Long zeroBasedRank = rankingRedisRepository.findRank(window, memberId);
        Double score = rankingRedisRepository.findScore(window, memberId);
        long total = rankingRedisRepository.count(window);
        if (zeroBasedRank == null || score == null || total == 0) {
            return new MyRankingResponse(null, null, null, metadata.calculatedAt(), metadata.periodStart(),
                    metadata.periodEnd());
        }
        int rank = Math.toIntExact(zeroBasedRank + 1);
        BigDecimal percentile = BigDecimal.valueOf(total - zeroBasedRank)
                .multiply(BigDecimal.valueOf(100))
                .divide(BigDecimal.valueOf(total), 2, RoundingMode.HALF_UP);
        return new MyRankingResponse(rank, score.longValue(), percentile, metadata.calculatedAt(), metadata.periodStart(),
                metadata.periodEnd());
    }

    /** 컨테이너 기동 시 캐시가 없을 때만 현재 3개 기간을 복구한다. */
    public void rebuildMissingSnapshots() {
        for (RankingPeriod period : RankingPeriod.values()) {
            RankingWindow window = RankingWindow.current(period);
            try {
                if (!rankingRedisRepository.hasSnapshot(window)) {
                    rebuild(window, false);
                }
            } catch (DataAccessException exception) {
                log.warn("랭킹 Redis 초기화 보류 period={}: {}", period, exception.getMessage());
            }
        }
    }

    /** 매일 06:00에 이전 확정 범위 기준 스냅샷을 새로 만든다. */
    public void rebuildAllSnapshots() {
        for (RankingPeriod period : RankingPeriod.values()) {
            rebuild(RankingWindow.current(period), true);
        }
    }

    private RankingSnapshotMetadata ensureSnapshot(RankingWindow window) {
        try {
            RankingSnapshotMetadata metadata = rankingRedisRepository.metadata(window);
            if (metadata != null) {
                return metadata;
            }
            return rebuild(window, false);
        } catch (DataAccessException exception) {
            throw exception;
        }
    }

    private synchronized RankingSnapshotMetadata rebuild(RankingWindow window, boolean force) {
        RankingSnapshotMetadata existing = rankingRedisRepository.metadata(window);
        if (!force && existing != null) {
            return existing;
        }
        List<RankingSourceRow> rows = rankingQueryRepository
                .sumFocusedSecondsByMember(window.startAt().toLocalDate(), window.endAt().toLocalDate(),
                        AccountStatus.ACTIVE)
                .stream()
                .filter(row -> row.focusedSeconds() > 0)
                .sorted(Comparator.comparing(RankingSourceRow::focusedSeconds).reversed()
                        .thenComparing(RankingSourceRow::memberId, Comparator.reverseOrder()))
                .toList();
        LocalDateTime calculatedAt = LocalDateTime.now();
        rankingRedisRepository.save(window, rows, calculatedAt);
        return new RankingSnapshotMetadata(calculatedAt, window.startAt(), window.endAt(), rows.size());
    }

    private List<RankingEntryResponse> toEntries(RankingWindow window, List<RankingRedisRepository.RankingScore> scores,
            long firstRank) {
        Map<Long, Member> members = membersById(scores.stream().map(RankingRedisRepository.RankingScore::memberId).toList());
        return java.util.stream.IntStream.range(0, scores.size()).mapToObj(index -> {
            RankingRedisRepository.RankingScore score = scores.get(index);
            Member member = members.get(score.memberId());
            return new RankingEntryResponse(Math.toIntExact(firstRank + index), score.memberId(),
                    member == null ? "알 수 없음" : member.getNickname(), score.focusedSeconds());
        }).toList();
    }

    private Map<Long, Member> membersById(Collection<Long> memberIds) {
        return memberRepository.findAllById(memberIds).stream()
                .collect(Collectors.toMap(Member::getId, Function.identity()));
    }
}
