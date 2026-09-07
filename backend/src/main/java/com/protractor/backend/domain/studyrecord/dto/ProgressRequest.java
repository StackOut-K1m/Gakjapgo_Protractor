package com.protractor.backend.domain.studyrecord.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.PositiveOrZero;

/**
 * 진행 동기화 요청. 클라이언트가 로컬 타이머로 센 누적 초를 30~60초 주기로 보낸다.
 *
 * 서버가 덮어쓰기 때문에 전송이 한 번 실패해도 다음 동기화에 전체 누적값이 담긴다. 자세 관련 값은 서버가 계산하므로 여기 담지 않는다.
 */
@Schema(description = "세션 진행 동기화 요청(누적 초)")
public record ProgressRequest(
		@Schema(description = "누적 집중(순공부) 초", example = "1200") @NotNull @PositiveOrZero Integer focusedSeconds,

		@Schema(description = "누적 휴식 초", example = "300") @NotNull @PositiveOrZero Integer breakSeconds,

		@Schema(description = "누적 자리비움 초", example = "60") @NotNull @PositiveOrZero Integer awaySeconds) {
}
