package com.protractor.backend.domain.ranking.controller;

import com.protractor.backend.domain.ranking.RankingPeriod;
import com.protractor.backend.domain.ranking.dto.MyRankingResponse;
import com.protractor.backend.domain.ranking.dto.RankingPageResponse;
import com.protractor.backend.domain.ranking.dto.RankingPreviewResponse;
import com.protractor.backend.domain.ranking.service.RankingService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@Tag(name = "Ranking", description = "확정된 순공 시간 기반 랭킹 API")
@RestController
@RequestMapping("/api/v1")
@RequiredArgsConstructor
public class RankingController {

    private final RankingService rankingService;

    @Operation(summary = "공개 랭킹 미리보기", description = "기간별 상위 10명을 조회한다.")
    @GetMapping("/public/rankings/preview")
    public RankingPreviewResponse preview(@RequestParam(defaultValue = "week") String period) {
        return rankingService.getPreview(RankingPeriod.from(period));
    }

    @Operation(summary = "순공 시간 랭킹 목록", description = "Redis에 공개된 기간 스냅샷을 페이지 단위로 조회한다.")
    @GetMapping("/rankings/study-time")
    public RankingPageResponse rankings(@RequestParam(defaultValue = "week") String period,
            @RequestParam(defaultValue = "0") int page, @RequestParam(defaultValue = "20") int size) {
        return rankingService.getRankings(RankingPeriod.from(period), page, size);
    }

    @Operation(summary = "내 순공 시간 랭킹", description = "현재 로그인 회원의 순위, 순공 시간, 백분위를 조회한다.")
    @GetMapping("/rankings/me")
    public MyRankingResponse myRanking(@RequestParam(defaultValue = "week") String period,
            Authentication authentication) {
        return rankingService.getMyRanking(RankingPeriod.from(period), (Long) authentication.getPrincipal());
    }
}
