package com.protractor.backend.domain.ranking.dto;

import java.time.LocalDateTime;
import java.util.List;

public record RankingPageResponse(List<RankingEntryResponse> rankings, int page, int size, long totalElements,
        int totalPages, LocalDateTime calculatedAt, LocalDateTime periodStart, LocalDateTime periodEnd) {
}
