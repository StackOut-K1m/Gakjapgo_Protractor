package com.protractor.backend.domain.ranking;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.time.ZonedDateTime;

/**
 * 배치가 확정된 학습 기록만 포함하도록 오늘 00:00 전까지를 상한으로 둔다.
 *
 * <p>세 기간 모두 "어제까지 거슬러 N일"인 이동 구간이다. 달력 경계(이번 주 월요일부터, 이번 달 1일부터)로
 * 잡으면 <b>월요일과 매달 1일에 구간 길이가 0이 되어 랭킹이 통째로 빈다</b>. 그날만 화면이 비는 거라
 * 평일에 테스트하면 발견되지 않는다. 길이를 1·7·30일로 고정해 그 경우를 없앴다.
 *
 * <p>화면 라벨(어제 / 최근 7일 / 최근 30일)도 이 구간과 같은 뜻이어야 한다.
 * frontend RankingSection 의 PERIOD_OPTIONS 를 함께 본다.
 */
public record RankingWindow(RankingPeriod period, LocalDateTime startAt, LocalDateTime endAt, String cacheToken) {

    private static final ZoneId KOREA = ZoneId.of("Asia/Seoul");

    public static RankingWindow current(RankingPeriod period) {
        LocalDate end = ZonedDateTime.now(KOREA).toLocalDate();  // 오늘 00:00 = 상한(미포함)
        LocalDate start = switch (period) {
            case YESTERDAY -> end.minusDays(1);
            case WEEK -> end.minusDays(7);
            case MONTH -> end.minusDays(30);
        };
        // 구간이 하루씩 밀리므로 시작일만으로 캐시 키가 유일해진다(키에 period 가 이미 들어간다).
        return new RankingWindow(period, start.atStartOfDay(), end.atStartOfDay(), start.toString());
    }
}
