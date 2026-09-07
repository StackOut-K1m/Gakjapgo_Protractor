package com.protractor.backend.domain.stretching.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotNull;
import java.math.BigDecimal;
import java.time.LocalDateTime;

@Schema(description = "스트레칭 완료 요청")
public record StretchingCompleteRequest(
		@Schema(description = "완료율(0~100)", example = "95.5") @NotNull @DecimalMin("0.0") @DecimalMax("100.0") BigDecimal completionRate,
		@Schema(description = "프론트에서 감지한 완료 시각. 비우면 서버 현재 시각 사용", example = "2026-07-27T15:30:30") LocalDateTime completedAt) {
}
