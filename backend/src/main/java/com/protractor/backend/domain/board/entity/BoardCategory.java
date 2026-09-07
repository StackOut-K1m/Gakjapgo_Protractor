package com.protractor.backend.domain.board.entity;

import java.util.List;

/**
 * 게시글 말머리(게시판 구분). posts.category(VARCHAR)에 이름 그대로 저장된다.
 *
 * <p>
 * 커뮤니티 통합 게시판의 "전체 게시글" 탭은 NOTICE·FREE·QNA·SHARE만 보여준다.
 * EVENT(이벤트 페이지)·INQUIRY(1:1 문의 페이지)는 별도 화면이 카테고리를 지정해 조회한다.
 */
public enum BoardCategory {
    NOTICE, // 공지사항 — 관리자만 작성, 목록 상단 고정
    FREE,   // 자유게시판
    QNA,    // 질문하기
    SHARE,  // 자료공유
    EVENT,  // 이벤트 — 관리자만 작성
    INQUIRY; // 1:1 문의 — 작성자 본인과 관리자만 조회

    /** "전체 게시글" 탭이 포함하는 커뮤니티 카테고리 묶음. */
    public static List<BoardCategory> communityCategories() {
        return List.of(NOTICE, FREE, QNA, SHARE);
    }
}
