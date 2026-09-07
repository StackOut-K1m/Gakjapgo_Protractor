package com.protractor.backend.domain.board.dto;

import com.protractor.backend.domain.board.entity.BoardCategory;
import java.time.LocalDateTime;
import java.util.List;

/**
 * 게시글 상세 응답. 화면 왕복을 줄이려고 댓글·첨부 목록을 함께 내려준다.
 * mine은 "현재 로그인 회원이 작성자인가"로, FE가 수정/삭제 버튼 노출에 쓴다(비로그인은 false).
 */
public record PostDetailResponse(
        Long postId,
        BoardCategory category,
        String title,
        String content,
        String authorNickname,
        boolean mine,
        LocalDateTime createdAt,
        LocalDateTime updatedAt,
        int viewCount,
        int commentCount,
        List<AttachmentResponse> attachments,
        List<CommentResponse> comments
) {
}
