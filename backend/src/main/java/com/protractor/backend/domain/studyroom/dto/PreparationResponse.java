package com.protractor.backend.domain.studyroom.dto;

import io.swagger.v3.oas.annotations.media.Schema;

/**
 * 스터디룸 입장 준비 정보 응답.
 *
 * <p>
 * cameraRequired/postureRequired는 현재 모든 방에서 true 고정이다.
 */
@Schema(description = "스터디룸 입장 준비 정보 응답")
public record PreparationResponse(String roomTitle, int participantsCount,
		@Schema(description = "카메라 필수 여부") boolean cameraRequired,
		@Schema(description = "자세 인식 필수 여부") boolean postureRequired) {
}
