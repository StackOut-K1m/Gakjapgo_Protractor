package com.protractor.backend.domain.studyroom.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotNull;

/** 스터디룸 입장 요청. 회원 ID는 JWT에서 추출한다. */
@Schema(description = "스터디룸 입장 요청")
public record JoinRoomRequest(
		@Schema(description = "카메라 확인 여부", example = "true") @NotNull Boolean cameraChecked,

		@Schema(description = "자세 기준선 확인 여부", example = "true") @NotNull Boolean postureChecked,

		@Schema(description = "잠금 방 입장 비밀번호", example = "1234") String password) {
}
