package com.protractor.backend.domain.studyroom.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.PositiveOrZero;
import jakarta.validation.constraints.Size;

/** 스터디룸 수정 요청(PATCH). null인 필드는 변경하지 않는다. */
@Schema(description = "스터디룸 수정 요청(부분 수정)")
public record UpdateStudyRoomRequest(

		@Schema(description = "방 제목", example = "정처기 실기 대비방") @Size(max = 100) String title,

		@Schema(description = "최대 인원", example = "4") @Positive Integer maxMembers,

		@Schema(description = "집중 시간(초)", example = "3000") @Positive Integer focusDurationSeconds,

		@Schema(description = "휴식 시간(초)", example = "600") @PositiveOrZero Integer breakDurationSeconds,

		@Schema(description = "스트레칭 사용 여부", example = "true") Boolean stretchingEnabled,

		@Schema(description = "카테고리(study_tag_id)", example = "6") Long studyTagId,

		@Schema(description = "자유 해시태그", example = "#알고리즘 #코딩테스트") @Size(max = 500) String hashTags,

		@Schema(description = "비공개(비밀번호) 방 여부", example = "false") Boolean isLocked,

		@Schema(description = "방 비밀번호", example = "1234") @Size(max = 255) String password,

		@Schema(description = "스터디 규칙") String rules,

		@Schema(description = "스터디 소개글") String description,

		@Schema(description = "방 썸네일 이미지 URL") @Size(max = 1000) String thumbnailImageUrl) {
}
