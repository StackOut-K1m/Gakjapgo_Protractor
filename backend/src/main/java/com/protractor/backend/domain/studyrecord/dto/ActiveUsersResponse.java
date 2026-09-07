package com.protractor.backend.domain.studyrecord.dto;

import io.swagger.v3.oas.annotations.media.Schema;

/** 홈 화면의 "지금 공부 중" 인원. 비로그인에도 보이는 값이라 개인 정보는 담지 않는다. */
@Schema(description = "지금 공부 중인 인원")
public record ActiveUsersResponse(
		@Schema(description = "스터디룸에 들어와 있는 회원 수", example = "1240") long activeUserCount) {
}
