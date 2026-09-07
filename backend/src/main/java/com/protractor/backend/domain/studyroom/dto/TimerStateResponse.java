package com.protractor.backend.domain.studyroom.dto;

import io.swagger.v3.oas.annotations.media.Schema;

/**
 * 방 타이머의 "현재 진행 상태" 조회 응답. 늦게 입장한 사람이 지금 어느 페이즈에 몇 초 남았는지 동기화할 때 쓴다.
 *
 * <p>
 * 타이머가 돌고 있지 않으면 running=false로 나온다.
 */
@Schema(description = "방 타이머 현재 진행 상태")
public record TimerStateResponse(
		@Schema(description = "타이머 진행 중 여부", example = "true") boolean running,
		@Schema(description = "현재 페이즈", example = "FOCUS", allowableValues = { "FOCUS", "STRETCHING",
				"BREAK" }) String phase,
		@Schema(description = "몇 번째 페이즈", example = "3") Integer sequence,
		@Schema(description = "이번 페이즈 전체 길이(초)", example = "3000") Integer durationSeconds,
		@Schema(description = "이번 페이즈 남은 시간(초)", example = "1740") Long remainingSeconds,
		@Schema(description = "스트레칭 사용 여부", example = "true") boolean stretchingEnabled) {

	/** 타이머가 실행 중이 아닐 때. */
	public static TimerStateResponse notRunning() {
		return new TimerStateResponse(false, null, null, null, null, false);
	}
}
