package com.protractor.backend.domain.board.entity;

/**
 * 게시글 공개 상태. posts.status ENUM('PUBLISHED','HIDDEN')과 1:1 대응한다.
 * HIDDEN은 운영자 숨김 처리용으로 자리만 잡아 둔 값이라 현재 API는 PUBLISHED만 노출한다.
 */
public enum PostStatus {
    PUBLISHED,
    HIDDEN
}
