package com.protractor.backend.domain.posture.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.PositiveOrZero;
import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * 자세 체크 결과 저장 요청.
 *
 * <p>
 * 이 입구는 <b>클라이언트가 이미 확정한</b> 이벤트를 받는다. 서버가 직접 판정하는
 * {@link PostureFrameRequest}와는 역할이 다르며, 온디바이스 판정을 쓰거나 서버 판정을 끈 환경에서 쓰인다.
 *
 * <p>
 * 필드는 events 테이블 컬럼과 1:1로 맞췄다. 중간에 이름을 바꾸면 저장된 값과 API 문서를 대조할 때마다 매핑표를 봐야 한다.
 *
 * @param eventType 이벤트 종류. 이 입구는 POSTURE만 받는다
 * @param detail 세부 자세. bodyPart만으로는 종류를 구분할 수 없으므로 반드시 채운다
 * @param bodyPart 부위
 * @param deviationDegrees 기준선 이탈 각도
 * @param alertChannel 알림 채널
 * @param severity 심각도 1~5
 * @param startedAt 나쁜 자세가 시작된 시각
 * @param endedAt 해소 시각. 비어 있으면 아직 진행 중인 이벤트다
 * @param durationSeconds 지속 시간(초). 세션 종료 시 bad_posture_seconds 합산에 쓰이므로 되도록 채운다
 * @param captureUrl 캡처 이미지 URL(동의 시)
 */
@Schema(description = "자세 체크 결과 저장 요청(클라이언트 확정분)")
public record PostureCheckRequest(
		@Schema(description = "이벤트 종류", example = "POSTURE", allowableValues = { "POSTURE" }) @NotBlank String eventType,

		@Schema(description = "세부 자세", example = "FORWARD_HEAD", allowableValues = { "FORWARD_HEAD", "SHOULDER_TILT",
				"CHIN_REST" }) @NotBlank String detail,

		@Schema(description = "부위", example = "NECK", allowableValues = { "NECK", "SHOULDER",
				"BACK" }) @NotBlank String bodyPart,

		@Schema(description = "기준선 이탈 각도", example = "15.5") @PositiveOrZero BigDecimal deviationDegrees,

		@Schema(description = "알림 채널", example = "VISUAL", allowableValues = { "VOICE", "TEXT",
				"VISUAL" }) String alertChannel,

		@Schema(description = "심각도(1~5)", example = "3") @Min(1) @Max(5) Integer severity,

		@Schema(description = "감지 시작 시각", example = "2026-07-26T10:00:00") @NotNull LocalDateTime startedAt,

		@Schema(description = "해소 시각(진행 중이면 생략)", example = "2026-07-26T10:00:32") LocalDateTime endedAt,

		@Schema(description = "지속 시간(초)", example = "32") @PositiveOrZero Integer durationSeconds,

		@Schema(description = "캡처 이미지 URL(동의 시)") String captureUrl) {
}
