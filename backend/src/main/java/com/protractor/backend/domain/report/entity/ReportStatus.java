package com.protractor.backend.domain.report.entity;

/**
 * 리포트 생성 상태. DB {@code reports.status ENUM}과 값이 같아야 하며,
 * FE는 이 값으로 생성 완료를 폴링한다 (PENDING → RUNNING → COMPLETED / FAILED).
 *
 * <p>
 * 명세서에는 PROCESSING으로 적혀 있지만 DB 정의서·FE 타입 모두 RUNNING이라 RUNNING으로 통일한다(노션 수정 대상).
 */
public enum ReportStatus {
    PENDING, RUNNING, COMPLETED, FAILED
}
