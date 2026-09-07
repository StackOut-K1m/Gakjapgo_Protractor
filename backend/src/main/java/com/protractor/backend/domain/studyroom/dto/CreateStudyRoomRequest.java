package com.protractor.backend.domain.studyroom.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.PositiveOrZero;
import jakarta.validation.constraints.Size;

/** 스터디룸 생성 요청. null인 선택 필드는 서비스에서 기본값으로 채운다. */
@Schema(description = "스터디룸 생성 요청")
public record CreateStudyRoomRequest(

		@Schema(description = "방 제목", example = "정처기 같이 공부해요") @NotBlank @Size(max = 100) String title,

		@Schema(description = "방 유형(미지정 시 FOCUS)", example = "FOCUS") String roomType,

		@Schema(description = "최대 인원(미지정 시 6)", example = "6") @Positive Integer maxMembers,

		@Schema(description = "계획 학습 시간(초, 선택)", example = "7200") @PositiveOrZero Integer plannedDurationSeconds,

		@Schema(description = "집중 시간(초, 미지정 시 3000=50분)", example = "3000") @Positive Integer focusDurationSeconds,

		@Schema(description = "휴식 시간(초, 미지정 시 600=10분)", example = "600") @PositiveOrZero Integer breakDurationSeconds,

		@Schema(description = "스트레칭 사용 여부(미지정 시 true)", example = "true") Boolean stretchingEnabled,

		@Schema(description = "카테고리(study_tag_id, 미지정 시 8=자기계발)", example = "6") Long studyTagId,

		@Schema(description = "자유 해시태그", example = "#알고리즘 #코딩테스트") @Size(max = 500) String hashTags,

		@Schema(description = "비공개(비밀번호) 방 여부(미지정 시 false)", example = "false") Boolean isLocked,

		@Schema(description = "방 비밀번호(비공개 방일 때, 숫자 최대 8자리 등)", example = "1234") @Size(max = 255) String password,

		@Schema(description = "스터디 규칙", example = "매일 밤 11시까지 인증") String rules,

		@Schema(description = "스터디 소개글", example = "함께 성장하는 알고리즘 스터디입니다.") String description,

		@Schema(description = "방 썸네일 이미지 URL", example = "https://.../thumb.png") @Size(max = 1000) String thumbnailImageUrl) {
}
