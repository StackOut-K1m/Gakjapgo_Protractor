package com.protractor.backend.domain.ranking.dto;

import java.time.LocalDateTime;
import java.util.List;

public record RankingPreviewResponse(List<RankingEntryResponse> rankings, LocalDateTime calculatedAt,
        LocalDateTime periodStart, LocalDateTime periodEnd) {
}
