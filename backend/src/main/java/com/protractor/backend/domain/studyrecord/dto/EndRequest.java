package com.protractor.backend.domain.studyrecord.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.PositiveOrZero;
import java.util.List;

/**
 * 세션 종료 요청. 최종 누적값과 종료 사유를 보낸다.
 *
 * 점수·자세 지표는 클라이언트가 보내지 않는다. 서버가 저장된 events를 집계해 계산한다(값 자체는 서버가 만든다).
 *
 * <p>
 * 졸음·휴대폰 목록은 <b>여기서 받지 않는다.</b> 둘 다 발생 즉시 저장되는 입구가 있다
 * ({@code POST /study-sessions/{sessionId}/drowsiness-checks}, {@code .../phone-checks}). 필드를 남겨
 * 두면 사고가 난다 — {@link #postureEvents()}처럼 목록을 받는 필드는 "추가"가 아니라 "그 종류를 전부 지우고 이것으로
 * 교체"로 동작하기 때문에, 빈 배열만 실려 와도 세션 중 실시간으로 쌓인 기록이 통째로 사라지고 응답은 200이 된다. 받을 통로를
 * 없애 그 실수가 불가능하게 둔다.
 */
@Schema(description = "세션 종료 요청")
public record EndRequest(
		@Schema(description = "최종 누적 집중(순공부) 초", example = "1800") @NotNull @PositiveOrZero Integer focusedSeconds,

		@Schema(description = "최종 누적 휴식 초", example = "300") @NotNull @PositiveOrZero Integer breakSeconds,

		@Schema(description = "최종 누적 자리비움 초", example = "60") @NotNull @PositiveOrZero Integer awaySeconds,

		@Schema(description = "종료 사유", example = "COMPLETED", allowableValues = { "COMPLETED", "USER_EXIT",
				"TIMEOUT" }) String endReason,

		/**
		 * 서버 판정을 쓰지 않는 환경에서 브라우저가 모아 둔 자세 이벤트.
		 *
		 * <p>
		 * 이 값을 담아 보내면 세션의 POSTURE 이벤트가 <b>전부 삭제되고</b> 이 목록으로 교체된다. 실시간으로 저장된 턱
		 * 괴기(CHIN_REST)까지 함께 지워지므로, 서버 판정을 쓰는 평소 경로에서는 넣지 말아야 한다.
		 */
		@Schema(description = "종료 시 한 번에 저장할 자세 감지 이벤트 목록(보내면 기존 POSTURE 이벤트를 교체한다)") List<@Valid PostureCheckRequest> postureEvents) {
}
