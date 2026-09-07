package com.protractor.backend.domain.board.dto;

import com.protractor.backend.domain.board.entity.BoardCategory;
import java.time.LocalDateTime;

/** 목록 쿼리 프로젝션 행(posts + 작성자 닉네임 + 댓글 수). 응답 변환 전의 중간 형태다. */
public record PostSummaryRow(
        Long postId,
        BoardCategory category,
        String title,
        String authorNickname,
        LocalDateTime createdAt,
        int viewCount,
        int commentCount,
        /** 본문 앞부분. 목록 카드에 한 줄 설명을 붙이는 용도라 전체를 싣지 않는다. */
        String excerpt
) {
}
