package com.protractor.backend.domain.board.dto;

import java.time.LocalDateTime;

/** 댓글 조회 프로젝션 행(comments + 작성자 닉네임). */
public record CommentRow(
        Long commentId,
        Long authorMemberId,
        String authorNickname,
        String content,
        LocalDateTime createdAt
) {
}
