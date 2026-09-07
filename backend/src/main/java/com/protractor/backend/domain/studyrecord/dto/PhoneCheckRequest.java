package com.protractor.backend.domain.studyrecord.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.PositiveOrZero;
import java.time.LocalDateTime;

/**
 * 휴대폰 사용 감지 이벤트 저장 요청.
 *
 * 브라우저의 YOLO 감지(usePhoneDetection)가 확정한 구간 <b>한 건</b>이다. 화면에서 폰이 사라져 구간이 닫히는 즉시
 * {@code POST /study-sessions/{sessionId}/phone-checks}로 보낸다. 자세가 아니라 집중을 깨는 행동이라 부위·세부
 * 종류가 없고, 구간 정보만 남긴다.
 */
@Schema(description = "휴대폰 사용 감지 이벤트 저장 요청")
public record PhoneCheckRequest(
		// type을 string으로 고정해야 Swagger가 예시를 그대로 보여준다(date-time이면 오프셋 Z가 붙어 파싱 실패).
		@Schema(type = "string", description = "사용 시작 시각", example = "2026-07-26T10:05:00") @NotNull LocalDateTime startedAt,

		@Schema(type = "string", description = "사용 종료 시각(화면에서 폰이 사라진 시점)", example = "2026-07-26T10:06:30") LocalDateTime endedAt,

		@Schema(description = "사용 시간(초)", example = "90") @PositiveOrZero Integer durationSeconds) {
}
