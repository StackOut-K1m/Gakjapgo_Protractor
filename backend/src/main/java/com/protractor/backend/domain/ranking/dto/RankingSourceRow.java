package com.protractor.backend.domain.ranking.dto;

/** DB 원천 집계 결과다. Redis에는 회원 ID와 순공 시간만 파생 캐시로 저장한다. */
public record RankingSourceRow(Long memberId, String nickname, Long focusedSeconds) {
}
