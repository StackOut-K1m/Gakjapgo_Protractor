package com.protractor.backend.domain.ranking;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Duration;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.util.Map;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/**
 * 랭킹 집계 구간 검증.
 *
 * <p>
 * 원래는 달력 경계로 구간을 잡았다(이번 주 월요일부터 / 이번 달 1일부터). 그러면 <b>월요일과 매달 1일에 시작과 끝이 같은 시각이
 * 되어 구간 길이가 0</b>이 되고, 조회 결과가 0건이라 랭킹이 통째로 빈다. 그날 하루만 재현되므로 평일에 손으로 눌러 보는 방식으로는
 * 발견되지 않는다. 그래서 "어떤 날짜에 실행해도 구간이 비지 않는다"를 코드로 고정해 둔다.
 *
 * <p>
 * {@link RankingWindow#current}는 현재 시각을 직접 읽으므로 특정 날짜를 주입할 수 없다. 대신 실행 시각과 무관하게
 * 성립해야 하는 성질만 확인한다.
 */
class RankingWindowTest {

	private static final ZoneId KOREA = ZoneId.of("Asia/Seoul");

	/**
	 * 화면 라벨(어제 / 최근 7일 / 최근 30일)과 같은 값이어야 한다.
	 *
	 * <p>
	 * Long 으로 둔다. Integer 로 두면 {@code isEqualTo(long)} 이 아니라 {@code isEqualTo(Object)} 가 선택되어
	 * 1 과 1L 이 다르다는 이유로 실패한다.
	 */
	private static final Map<RankingPeriod, Long> EXPECTED_DAYS = Map.of(
			RankingPeriod.YESTERDAY, 1L,
			RankingPeriod.WEEK, 7L,
			RankingPeriod.MONTH, 30L);

	@Test
	@DisplayName("어떤 요일·날짜에 실행해도 구간이 비지 않는다")
	void windowIsNeverEmpty() {
		for (RankingPeriod period : RankingPeriod.values()) {
			RankingWindow window = RankingWindow.current(period);
			assertThat(window.startAt())
					.as("%s 구간의 시작은 끝보다 앞서야 한다. 같으면 조회 결과가 0건이 되어 랭킹이 빈다", period)
					.isBefore(window.endAt());
		}
	}

	@Test
	@DisplayName("구간 길이는 기간별로 1·7·30일로 고정된다")
	void windowSpansFixedNumberOfDays() {
		EXPECTED_DAYS.forEach((period, expectedDays) -> {
			RankingWindow window = RankingWindow.current(period);
			assertThat(Duration.between(window.startAt(), window.endAt()).toDays())
					.as("%s 는 %d일치를 세야 한다", period, expectedDays)
					.isEqualTo(expectedDays);
		});
	}

	@Test
	@DisplayName("상한은 한국 시간 기준 오늘 00:00 이라 오늘 기록은 포함되지 않는다")
	void windowExcludesToday() {
		LocalDate today = ZonedDateTime.now(KOREA).toLocalDate();
		for (RankingPeriod period : RankingPeriod.values()) {
			assertThat(RankingWindow.current(period).endAt())
					.as("%s 상한", period)
					.isEqualTo(today.atStartOfDay());
		}
	}

	@Test
	@DisplayName("같은 기간이라도 날이 바뀌면 캐시 키가 달라져 스냅샷이 새로 만들어진다")
	void cacheTokenRollsWithTheWindow() {
		for (RankingPeriod period : RankingPeriod.values()) {
			RankingWindow window = RankingWindow.current(period);
			assertThat(window.cacheToken())
					.as("%s 캐시 토큰은 구간 시작일이어야 한다", period)
					.isEqualTo(window.startAt().toLocalDate().toString());
		}
	}
}
