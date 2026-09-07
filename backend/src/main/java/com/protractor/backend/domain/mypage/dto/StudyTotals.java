package com.protractor.backend.domain.mypage.dto;

/** 내 전체 스터디 기록의 누적 합계(초). JPQL 집계 결과를 담는 내부용 프로젝션이다. */
public record StudyTotals(
        Long totalStudySeconds,
        Long focusedSeconds,
        Long awaySeconds
) {
}
