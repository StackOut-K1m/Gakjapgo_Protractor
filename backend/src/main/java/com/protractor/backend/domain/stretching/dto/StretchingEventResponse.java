package com.protractor.backend.domain.stretching.dto;

import com.protractor.backend.domain.studyrecord.entity.Event;
import io.swagger.v3.oas.annotations.media.Schema;
import java.math.BigDecimal;
import java.time.LocalDateTime;

@Schema(description = "스트레칭 이벤트 응답")
public record StretchingEventResponse(
		@Schema(description = "이벤트 ID", example = "10") Long eventId,
		@Schema(description = "스터디 기록 ID", example = "4") Long studyRecordId,
		@Schema(description = "스트레칭 ID", example = "1") Long stretchingId,
		@Schema(description = "상태", example = "COMPLETED", allowableValues = { "STARTED", "COMPLETED",
				"SKIPPED" }) String status,
		@Schema(description = "완료율", example = "95.50") BigDecimal completionRate,
		@Schema(description = "시작 시각", example = "2026-07-27T15:30:00") LocalDateTime startedAt,
		@Schema(description = "종료 시각", example = "2026-07-27T15:30:30") LocalDateTime endedAt,
		@Schema(description = "진행 시간(초)", example = "30") Integer durationSeconds) {

	public static StretchingEventResponse from(Event event) {
		return new StretchingEventResponse(event.getId(), event.getStudyRecordId(), event.getStretchingId(),
				event.getDetail(), event.getCompletionRate(), event.getStartedAt(), event.getEndedAt(),
				event.getDurationSeconds());
	}
}
