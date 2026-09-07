package com.protractor.backend.domain.studyrecord.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import java.time.LocalDate;

/**
 * 홈 화면 상단의 개인 학습 요약.
 *
 * <p>
 * 오늘·이번 주·연속 학습일수를 한 번에 준다. 같은 화면에서 함께 쓰이는 값이라 나눠 두면 요청만
 * 늘고 화면이 부분적으로 채워지는 구간이 생긴다.
 *
 * <p>
 * 시간은 초 단위 원본만 내려준다. "21h 30m" 같은 표기는 화면마다 다를 수 있어 조립은 프론트가
 * 한다.
 */
@Schema(description = "홈 화면 개인 학습 요약")
public record StudySummaryResponse(
		@Schema(description = "오늘 집중 시간(초)", example = "11040") int todayFocusedSeconds,
		@Schema(description = "이번 주 시작일(월요일)", example = "2026-07-27") LocalDate weekStart,
		@Schema(description = "이번 주 종료일(일요일)", example = "2026-08-02") LocalDate weekEnd,
		@Schema(description = "이번 주 집중 시간(초)", example = "77400") int weekFocusedSeconds,
		@Schema(description = "지난주 집중 시간(초)", example = "66000") int lastWeekFocusedSeconds,
		@Schema(description = "지난주 대비 증감(초). 음수면 줄어든 것", example = "11400") int weekDiffSeconds,
		@Schema(description = "연속 학습일수. 오늘 아직 안 했으면 어제까지로 센다", example = "12") int streakDays) {

	public static StudySummaryResponse of(int today, LocalDate weekStart, int thisWeek, int lastWeek, int streakDays) {
		return new StudySummaryResponse(today, weekStart, weekStart.plusDays(6), thisWeek, lastWeek,
				thisWeek - lastWeek, streakDays);
	}
}
