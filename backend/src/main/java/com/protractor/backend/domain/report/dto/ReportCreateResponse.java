package com.protractor.backend.domain.report.dto;

import com.protractor.backend.domain.report.entity.ReportStatus;

/** POST /reports/me 응답(202 Accepted). FE는 reportId로 상태를 폴링한다. */
public record ReportCreateResponse(Long reportId, ReportStatus status) {
}
