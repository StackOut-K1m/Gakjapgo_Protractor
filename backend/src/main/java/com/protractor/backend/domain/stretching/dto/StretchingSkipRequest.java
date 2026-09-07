package com.protractor.backend.domain.stretching.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.Size;
import java.time.LocalDateTime;

@Schema(description = "스트레칭 건너뛰기 요청")
public record StretchingSkipRequest(
		@Schema(description = "건너뛰기 사유", example = "USER_SKIP") @Size(max = 30) String reason,
		@Schema(description = "프론트에서 감지한 건너뛰기 시각. 비우면 서버 현재 시각 사용", example = "2026-07-27T15:30:05") LocalDateTime skippedAt) {
}
