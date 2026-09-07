package com.protractor.backend.domain.board.dto;

import java.time.LocalDateTime;
import java.util.Objects;

public record CommentResponse(
        Long commentId,
        String authorNickname,
        String content,
        LocalDateTime createdAt,
        boolean mine
) {
    public static CommentResponse of(CommentRow row, Long currentMemberId) {
        return new CommentResponse(
                row.commentId(),
                row.authorNickname(),
                row.content(),
                row.createdAt(),
                Objects.equals(row.authorMemberId(), currentMemberId)
        );
    }
}
