package com.protractor.backend.domain.ranking.dto;

import java.time.LocalDateTime;

public record RankingSnapshotMetadata(LocalDateTime calculatedAt, LocalDateTime periodStart,
        LocalDateTime periodEnd, long totalMembers) {
}
