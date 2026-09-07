package com.protractor.backend.domain.report.dto;

import com.protractor.backend.domain.report.entity.Report;
import com.protractor.backend.domain.report.entity.ReportStatus;
import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * GET /reports/me/{reportId} 응답 — 생성 완료 폴링용.
 * pdfUrl은 COMPLETED일 때만 다운로드 API 경로가 담긴다. errorMessage는 FAILED일 때 원인 안내.
 */
public record ReportDetailResponse(
        Long reportId,
        ReportStatus status,
        LocalDate from,
        LocalDate to,
        boolean downloadable,
        String summaryText,
        String pdfUrl,
        LocalDateTime completedAt,
        String errorMessage) {

    public static ReportDetailResponse of(Report report) {
        return new ReportDetailResponse(
                report.getId(),
                report.getStatus(),
                report.getPeriodStartDate(),
                report.getPeriodEndDate(),
                report.isDownloadable(),
                report.getSummaryText(),
                report.isCompleted() ? "/api/v1/reports/me/" + report.getId() + "/download" : null,
                report.getCompletedAt(),
                report.getErrorMessage());
    }
}
