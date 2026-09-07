package com.protractor.backend.domain.report.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.time.LocalDate;

/**
 * POST /reports/me 요청. 상세 페이지의 "PDF로 리포트 다운로드"가 해당 주(weekStart~weekEnd)로 호출한다.
 *
 * @param from  분석 시작일(YYYY-MM-DD)
 * @param to    분석 종료일(같은 날 허용, 최대 31일)
 * @param title 리포트 제목(생략 시 "YYYY.MM.DD ~ YYYY.MM.DD 주간 리포트"로 자동 생성)
 */
public record ReportCreateRequest(
        @Schema(description = "분석 시작일", example = "2026-07-20") @NotNull LocalDate from,
        @Schema(description = "분석 종료일", example = "2026-07-26") @NotNull LocalDate to,
        @Schema(description = "리포트 제목(생략 가능)") @Size(max = 200) String title) {
}
