package com.protractor.backend.domain.studyrecord.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import java.time.LocalDateTime;

/**
 * 졸음 감지 이벤트 저장 요청. level은 events.severity에 저장된다.
 *
 * 브라우저가 확정한 졸음 한 건이며, 확정되는 즉시
 * {@code POST /study-sessions/{sessionId}/drowsiness-checks}로 보낸다. 시점 이벤트라 구간(종료 시각·지속
 * 시간)이 없다.
 */
@Schema(description = "졸음 감지 이벤트 저장 요청")
public record DrowsinessCheckRequest(
		@Schema(description = "졸음 단계(1~5)", example = "2") @NotNull @Min(1) @Max(5) Integer level,
		// type을 string으로 고정해야 Swagger가 예시를 그대로 보여준다.
		// 기본 date-time 형식이면 예시가 버려지고 오프셋(Z)이 붙은 값이 자동 생성되어 파싱에 실패한다.
		@Schema(type = "string", description = "감지 시각", example = "2026-07-26T10:05:00") @NotNull LocalDateTime detectedAt) {
}
