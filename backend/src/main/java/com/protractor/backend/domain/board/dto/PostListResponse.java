package com.protractor.backend.domain.board.dto;

import java.util.List;
import org.springframework.data.domain.Page;

/**
 * 게시글 목록 응답. FE boardApi.ts의 PostListPage 타입과 같은 중첩 page 구조다
 * (리포트 목록과 동일한 팀 관례).
 */
public record PostListResponse(
        List<PostSummaryResponse> posts,
        PageInfo page
) {
    public record PageInfo(int page, int size, long totalElements, int totalPages) {
    }

    public static PostListResponse from(Page<PostSummaryRow> result) {
        List<PostSummaryResponse> posts = result.getContent().stream()
                .map(PostSummaryResponse::from)
                .toList();
        PageInfo pageInfo = new PageInfo(
                result.getNumber(),
                result.getSize(),
                result.getTotalElements(),
                result.getTotalPages()
        );
        return new PostListResponse(posts, pageInfo);
    }
}
