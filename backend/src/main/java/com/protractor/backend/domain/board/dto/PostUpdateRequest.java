package com.protractor.backend.domain.board.dto;

import com.protractor.backend.domain.board.entity.BoardCategory;
import jakarta.validation.constraints.Size;

/** 게시글 부분 수정. null인 필드는 건드리지 않는다(일정 PATCH와 같은 방식). */
public record PostUpdateRequest(
        BoardCategory category,

        @Size(max = 200, message = "제목은 200자 이하로 입력해주세요.")
        String title,

        @Size(max = 20000, message = "내용은 20,000자 이하로 입력해주세요.")
        String content
) {
}
