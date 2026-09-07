package com.protractor.backend.domain.studyroom.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.Min;

/**
 * 방 타이머 설정 변경 요청(방장만). null인 필드는 변경하지 않는다.
 */
@Schema(description = "방 타이머 설정 변경 요청(방장)")
public record UpdateTimerRequest(
		@Schema(description = "집중 시간(분)", example = "50") @Min(1) Integer focusMinutes,

		@Schema(description = "휴식 시간(분)", example = "10") @Min(0) Integer breakMinutes,

		@Schema(description = "스트레칭 사용 여부", example = "true") Boolean stretchingEnabled) {
}
