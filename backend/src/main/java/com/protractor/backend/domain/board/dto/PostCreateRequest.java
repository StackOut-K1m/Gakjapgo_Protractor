package com.protractor.backend.domain.board.dto;

import com.protractor.backend.domain.board.entity.BoardCategory;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

public record PostCreateRequest(
        @NotNull(message = "게시판을 선택해주세요.")
        BoardCategory category,

        @NotBlank(message = "제목을 입력해주세요.")
        @Size(max = 200, message = "제목은 200자 이하로 입력해주세요.")
        String title,

        @NotBlank(message = "내용을 입력해주세요.")
        @Size(max = 20000, message = "내용은 20,000자 이하로 입력해주세요.")
        String content
) {
}
