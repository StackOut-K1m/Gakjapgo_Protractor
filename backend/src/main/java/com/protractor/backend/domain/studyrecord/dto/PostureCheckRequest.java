package com.protractor.backend.domain.studyrecord.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.PositiveOrZero;
import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * 자세 감지 이벤트. 브라우저의 자세 판정 모델이 확정한 이벤트를 세션 종료 시 한 번에 보낸다.
 *
 * postureType으로 종류를 구분한다. body_part만으로는 나눌 수 없어 종류를 함께 보내야 점수를 나눠 계산할 수 있다.
 * durationSeconds는 나쁜 자세 시간 합산에 쓰므로 되도록 함께 보낸다.
 */
@Schema(description = "자세 감지 이벤트 저장 요청")
public record PostureCheckRequest(
		@Schema(description = "자세 종류(거북목/어깨높낮이/턱괴기)", example = "FORWARD_HEAD", allowableValues = { "FORWARD_HEAD",
				"SHOULDER_TILT", "CHIN_REST" }) @NotBlank String postureType,

		@Schema(description = "기준선 이탈 각도", example = "15.5") BigDecimal deviationDegrees,

		@Schema(description = "알림 채널", example = "VOICE", allowableValues = { "VOICE", "TEXT",
				"VISUAL" }) String alertChannel,

		@Schema(description = "심각도(1~5)", example = "3") @Min(1) @Max(5) Integer severity,

		// type을 string으로 고정해야 Swagger가 예시를 그대로 보여준다(date-time이면 오프셋 Z가 붙어 파싱 실패).
		@Schema(type = "string", description = "감지 시작 시각", example = "2026-07-26T10:00:00") @NotNull LocalDateTime startedAt,

		@Schema(type = "string", description = "감지 종료 시각", example = "2026-07-26T10:00:05") LocalDateTime endedAt,

		@Schema(description = "지속 시간(초)", example = "5") @PositiveOrZero Integer durationSeconds,

		@Schema(description = "캡처 이미지 URL(동의한 경우에만, 없으면 생략)", example = "https://storage.example.com/captures/1.jpg") String captureUrl) {
}
