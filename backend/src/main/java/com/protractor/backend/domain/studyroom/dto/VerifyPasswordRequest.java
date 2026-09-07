package com.protractor.backend.domain.studyroom.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotBlank;

/** 비공개 방 비밀번호 확인 요청. 입장 전에 화면에서 미리 맞는지 보려고 쓴다. */
@Schema(description = "스터디룸 비밀번호 확인 요청")
public record VerifyPasswordRequest(
		@Schema(description = "입장 비밀번호", example = "1234") @NotBlank(message = "비밀번호를 입력해 주세요.") String password) {
}
