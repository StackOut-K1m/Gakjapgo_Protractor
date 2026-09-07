package com.protractor.backend.domain.studyroom.dto;

import io.swagger.v3.oas.annotations.media.Schema;

/**
 * 방 타이머 페이즈 브로드캐스트. 타이머 시작·페이즈 전환·정지 시 서버가
 * {@code /topic/study-rooms/{roomId}/timer} 구독자 전원에게 보낸다.
 */
@Schema(description = "방 타이머 페이즈 변화 브로드캐스트")
public record TimerPhaseResponse(
		@Schema(description = "이벤트 유형", example = "PHASE_CHANGED", allowableValues = { "STARTED", "PHASE_CHANGED",
				"STOPPED" }) String type,
		@Schema(description = "스터디룸 ID", example = "1") Long roomId,
		@Schema(description = "현재 페이즈", example = "FOCUS", allowableValues = { "FOCUS", "BREAK" }) String phase,
		@Schema(description = "방 안에서 몇 번째 페이즈인지(1부터)", example = "1") int sequence,
		@Schema(description = "이번 페이즈 전체 길이(초)", example = "3000") int durationSeconds,
		@Schema(description = "이번 페이즈 남은 시간(초)", example = "2998") long remainingSeconds,
		@Schema(description = "스트레칭 사용 여부", example = "true") boolean stretchingEnabled) {
}
