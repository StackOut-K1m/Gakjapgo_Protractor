package com.protractor.backend.domain.ranking.dto;

public record RankingEntryResponse(int rank, Long memberId, String nickname, long focusedSeconds) {
}
