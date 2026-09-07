package com.protractor.backend.domain.board.dto;

import com.protractor.backend.domain.board.entity.Post;
import java.time.LocalDateTime;

public record PostCreateResponse(
        Long postId,
        LocalDateTime createdAt
) {
    public static PostCreateResponse from(Post post) {
        return new PostCreateResponse(post.getId(), post.getCreatedAt());
    }
}
