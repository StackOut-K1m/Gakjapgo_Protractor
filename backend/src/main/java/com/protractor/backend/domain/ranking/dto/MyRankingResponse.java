package com.protractor.backend.domain.ranking.dto;

import java.math.BigDecimal;
import java.time.LocalDateTime;

public record MyRankingResponse(Integer rank, Long focusedSeconds, BigDecimal percentile,
        LocalDateTime calculatedAt, LocalDateTime periodStart, LocalDateTime periodEnd) {
}
