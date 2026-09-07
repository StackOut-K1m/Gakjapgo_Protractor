package com.protractor.backend.domain.mypage.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

import java.math.BigDecimal;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/**
 * 학습 집중률 계산 검증. 식 = 순공부 ÷ (순공부 + 자리비움).
 *
 * <p>
 * 서버가 총 학습 시간을 순공부+휴식+자리비움의 합으로 계산하므로(StudyRecord.syncProgress)
 * 이 분모는 "총 학습 시간 − 휴식 시간"과 같다. 휴식이 값에 영향을 주지 않는 것이 핵심이라,
 * 케이스마다 "휴식이 얼마였든"이라는 전제를 깔고 본다.
 */
class MyPageAttendanceRateTest {

	@Test
	@DisplayName("휴식은 분모에서 빠진다 — 순공 2970초·자리비움 1030초면 휴식이 얼마든 74.25%")
	void excludesBreakFromDenominator() {
		assertEquals(new BigDecimal("74.25"), MyPageService.attendanceRate(2970, 1030));
	}

	@Test
	@DisplayName("자리비움 없이 전부 순공이면 100%")
	void allFocusedIsHundred() {
		assertEquals(new BigDecimal("100.00"), MyPageService.attendanceRate(3600, 0));
	}

	@Test
	@DisplayName("순공 없이 자리비움만 있으면 0%")
	void allAwayIsZero() {
		assertEquals(new BigDecimal("0.00"), MyPageService.attendanceRate(0, 720));
	}

	@Test
	@DisplayName("소수 셋째 자리는 반올림한다 (1/6 = 16.666… → 16.67)")
	void roundsHalfUp() {
		assertEquals(new BigDecimal("16.67"), MyPageService.attendanceRate(100, 500));
	}

	@Test
	@DisplayName("기록이 없거나 전부 휴식인 세션이면 null — FE가 '-'로 표시")
	void nullWhenNoPresence() {
		assertNull(MyPageService.attendanceRate(0, 0));
	}
}
