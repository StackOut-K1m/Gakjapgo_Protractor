package com.protractor.backend.domain.report.dto;

/**
 * 기간 내 감지 이벤트를 (종류, 세부, 부위)로 묶은 카운트. 유형별 분류는 서비스에서 한다.
 *
 * @param totalSeconds 이 묶음의 duration_seconds 합. 구간을 남기지 않는 종류(졸음)는 0이다.
 */
public record EventCategoryRow(String eventType, String detail, String bodyPart, long count, long totalSeconds) {
}
