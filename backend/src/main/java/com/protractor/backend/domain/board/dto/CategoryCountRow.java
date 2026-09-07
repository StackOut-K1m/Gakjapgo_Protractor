package com.protractor.backend.domain.board.dto;

import com.protractor.backend.domain.board.entity.BoardCategory;

/** 말머리별 게시글 수 한 줄. 커뮤니티 탭 옆의 숫자를 채운다. */
public record CategoryCountRow(BoardCategory category, long count) {
}
