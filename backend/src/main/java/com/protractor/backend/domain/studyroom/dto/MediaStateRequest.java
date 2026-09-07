package com.protractor.backend.domain.studyroom.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotNull;

/**
 * 미디어 상태 전송 요청. 클라이언트가 {@code /app/study-rooms/{roomId}/media}로 보낸다.
 *
 * <p>
 * 카메라·마이크를 켜고 끄거나 화면 공유를 시작·중지할 때마다 보낸다. 누가 보냈는지는 요청이 아니라 인증 정보에서 정한다.
 */
@Schema(description = "미디어 상태 전송 요청")
public record MediaStateRequest(
		@Schema(description = "카메라 켜짐 여부", example = "true") @NotNull Boolean cameraOn,

		@Schema(description = "마이크 켜짐 여부", example = "true") @NotNull Boolean micOn,

		@Schema(description = "화면 공유 중 여부", example = "false") Boolean screenSharing) {
}
