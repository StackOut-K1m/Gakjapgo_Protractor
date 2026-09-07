package com.protractor.backend.domain.studyrecord.dto;

import java.time.Duration;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;

/**
 * 나쁜 자세가 이어진 한 구간.
 *
 * <p>
 * 지속 시간(duration_seconds)을 그대로 더하지 않고 구간을 받는 이유는, 자세 종류가 <b>동시에</b> 잡히기 때문이다. 거북목인
 * 채로 턱을 괴면 두 이벤트가 같은 시간대에 나란히 열려서, 길이를 그냥 더하면 그 시간이 두 번 세어진다.
 *
 * @param startedAt 나쁜 자세가 시작된 시각
 * @param endedAt 해소된 시각
 */
public record PostureInterval(LocalDateTime startedAt, LocalDateTime endedAt) {

	/**
	 * 겹치는 구간을 하나로 합쳐 나쁜 자세 시간을 센다.
	 *
	 * <p>
	 * 시작 시각 순으로 훑으며 겹치거나 맞닿은 구간을 이어 붙이고, 이어진 구간의 길이만 더한다. 겹침을 두 번 세면 나쁜 자세 시간이 공부한
	 * 시간보다 길어질 수 있고, 그러면 자세 유지율이 0%로 주저앉는다(실제로 겪은 문제다 — 33분 세션에서 44분이 나왔다).
	 *
	 * @param intervals 구간 목록. 순서는 상관없다
	 * @return 겹침을 제거한 총 초
	 */
	public static int mergedSeconds(List<PostureInterval> intervals) {
		List<PostureInterval> sorted = new ArrayList<>(intervals);
		sorted.sort(Comparator.comparing(PostureInterval::startedAt));

		int total = 0;
		LocalDateTime openedAt = null;
		LocalDateTime closedAt = null;
		for (PostureInterval interval : sorted) {
			LocalDateTime start = interval.startedAt();
			// 종료가 시작보다 앞선 구간은 길이를 0으로 본다. 시계가 어긋난 기록이 음수로 합산되는 것을 막는다.
			LocalDateTime end = interval.endedAt().isBefore(start) ? start : interval.endedAt();

			if (openedAt == null) {
				openedAt = start;
				closedAt = end;
			} else if (start.isAfter(closedAt)) {
				// 앞 구간과 떨어져 있다 — 여기서 끊고 다음 구간을 새로 연다.
				total += seconds(openedAt, closedAt);
				openedAt = start;
				closedAt = end;
			} else if (end.isAfter(closedAt)) {
				// 겹치거나 맞닿았고 뒤쪽이 더 멀리 간다 — 끝만 늘린다.
				closedAt = end;
			}
		}
		return openedAt == null ? 0 : total + seconds(openedAt, closedAt);
	}

	private static int seconds(LocalDateTime from, LocalDateTime to) {
		return (int) Duration.between(from, to).toSeconds();
	}
}
