package com.protractor.backend.domain.ranking;

import java.util.Locale;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.http.HttpStatus;

/** 홈에서 제공하는 고정 랭킹 기간이다. 모든 기간은 Asia/Seoul 기준으로 계산한다. */
public enum RankingPeriod {
    YESTERDAY,
    WEEK,
    MONTH;

    public static RankingPeriod from(String value) {
        try {
            return RankingPeriod.valueOf(value.toUpperCase(Locale.ROOT));
        } catch (IllegalArgumentException | NullPointerException exception) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "period는 yesterday, week, month 중 하나여야 합니다.");
        }
    }
}
