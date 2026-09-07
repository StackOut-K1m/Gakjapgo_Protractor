package com.protractor.backend.domain.studyrecord.dto;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.LocalDateTime;
import java.util.List;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/**
 * 나쁜 자세 시간 합산 검증.
 *
 * <p>
 * 자세는 동시에 잡힌다(거북목인 채로 턱 괴기). 겹친 시간을 두 번 세면 나쁜 자세가 공부한 시간보다 길어져 자세 유지율이 0%로 주저앉는다 —
 * 실제로 겪은 문제라 회귀를 막아 둔다.
 */
class PostureIntervalTest {

	private static final LocalDateTime BASE = LocalDateTime.of(2026, 8, 2, 16, 0, 0);

	/** 기준 시각에서 초 단위로 떨어진 구간 하나. */
	private static PostureInterval interval(int fromSeconds, int toSeconds) {
		return new PostureInterval(BASE.plusSeconds(fromSeconds), BASE.plusSeconds(toSeconds));
	}

	@Test
	@DisplayName("겹치지 않는 구간은 그대로 더한다")
	void sumsSeparateIntervals() {
		int seconds = PostureInterval.mergedSeconds(List.of(interval(0, 100), interval(200, 250)));

		assertThat(seconds).isEqualTo(150);
	}

	@Test
	@DisplayName("구간이 완전히 포함되면 바깥 구간 길이만 센다")
	void countsOuterIntervalOnlyWhenNested() {
		// 실제로 겪은 모양: 거북목 591초(16:45:03~16:54:55) 안에 턱 괴기 478초가 통째로 들어 있었다.
		int seconds = PostureInterval.mergedSeconds(List.of(interval(0, 591), interval(39, 517)));

		assertThat(seconds).isEqualTo(591);
	}

	@Test
	@DisplayName("일부만 겹치면 이어 붙여 한 구간으로 센다")
	void mergesPartiallyOverlappingIntervals() {
		int seconds = PostureInterval.mergedSeconds(List.of(interval(0, 100), interval(60, 180)));

		assertThat(seconds).isEqualTo(180);
	}

	@Test
	@DisplayName("맞닿은 구간도 하나로 잇는다")
	void mergesTouchingIntervals() {
		int seconds = PostureInterval.mergedSeconds(List.of(interval(0, 100), interval(100, 160)));

		assertThat(seconds).isEqualTo(160);
	}

	@Test
	@DisplayName("순서가 뒤섞여 있어도 결과가 같다")
	void sortsBeforeMerging() {
		int seconds = PostureInterval.mergedSeconds(List.of(interval(200, 250), interval(60, 180), interval(0, 100)));

		assertThat(seconds).isEqualTo(230);
	}

	@Test
	@DisplayName("종료가 시작보다 앞선 구간은 0초로 본다")
	void treatsReversedIntervalAsZero() {
		int seconds = PostureInterval.mergedSeconds(List.of(interval(100, 40)));

		assertThat(seconds).isZero();
	}

	@Test
	@DisplayName("이벤트가 없으면 0초다")
	void returnsZeroWhenEmpty() {
		assertThat(PostureInterval.mergedSeconds(List.of())).isZero();
	}
}
