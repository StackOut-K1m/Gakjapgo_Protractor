package com.protractor.backend.domain.calibration.dto;

import io.swagger.v3.oas.annotations.media.Schema;

/** 본문이 필요 없는 응답. 명세가 삭제 계열 API에 {@code { message }}를 쓰기로 해서 그 형태를 맞춘다. */
@Schema(description = "메시지 응답")
public record MessageResponse(String message) {
}
