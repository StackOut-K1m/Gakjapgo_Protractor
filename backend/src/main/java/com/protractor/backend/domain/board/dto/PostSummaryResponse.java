package com.protractor.backend.domain.board.dto;

import com.protractor.backend.domain.board.entity.BoardCategory;
import java.time.LocalDateTime;

public record PostSummaryResponse(
        Long postId,
        BoardCategory category,
        String title,
        String authorNickname,
        LocalDateTime createdAt,
        int viewCount,
        int commentCount,
        /**
         * 본문 앞부분(최대 120자).
         *
         * 목록 화면은 제목만 쓰지만, 홈의 이벤트 카드처럼 한 줄 설명이 필요한 곳이 있다.
         * 그 때문에 상세를 따로 부르면 카드 수만큼 요청이 늘어난다.
         */
        String excerpt
) {
    public static PostSummaryResponse from(PostSummaryRow row) {
        return new PostSummaryResponse(
                row.postId(),
                row.category(),
                row.title(),
                row.authorNickname(),
                row.createdAt(),
                row.viewCount(),
                row.commentCount(),
                row.excerpt()
        );
    }
}
