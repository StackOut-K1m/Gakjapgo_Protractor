package com.protractor.backend.domain.stretching.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import java.time.LocalDateTime;

@Schema(description = "스트레칭 시작 요청")
public record StretchingStartRequest(
		@Schema(description = "프론트에서 감지한 시작 시각. 비우면 서버 현재 시각 사용", example = "2026-07-27T15:30:00") LocalDateTime startedAt) {
}
