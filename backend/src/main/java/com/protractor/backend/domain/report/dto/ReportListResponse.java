package com.protractor.backend.domain.report.dto;

import com.protractor.backend.domain.report.entity.Report;
import com.protractor.backend.domain.report.entity.ReportStatus;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.List;
import org.springframework.data.domain.Page;

/**
 * GET /reports/me 응답 — 지난 리포트 목록. FE reportApi.ts 타입에 맞춰 페이지 정보를 중첩 객체로 내린다
 * (마이페이지 스터디 목록의 flat 페이지와 다름 — FE 목 기준을 따른 것).
 */
public record ReportListResponse(List<Item> reports, PageInfo page) {

    private static final DateTimeFormatter TITLE_DATE = DateTimeFormatter.ofPattern("yyyy.MM.dd");

    /**
     * 목록 한 줄.
     *
     * <p>
     * from·to 를 함께 내리는 이유: 어느 주차 리포트인지는 제목 문자열이 아니라 데이터로 알아야 한다.
     * 제목은 요청할 때 자유롭게 지정할 수 있어서(FE 가 고정 문구를 보내면 기간이 사라진다) 화면이
     * 제목을 파싱해 기간을 얻으려 하면 깨진다.
     */
    public record Item(Long reportId, String title, LocalDate from, LocalDate to, ReportStatus status,
            LocalDateTime createdAt, boolean downloadable) {

        public static Item of(Report report) {
            // 제목은 생성 시 항상 채우지만, 혹시 비어 있는 행도 목록이 깨지지 않게 기본 제목을 만들어 준다.
            String title = report.getReportTitle() != null ? report.getReportTitle()
                    : TITLE_DATE.format(report.getPeriodStartDate()) + " ~ "
                            + TITLE_DATE.format(report.getPeriodEndDate()) + " 주간 리포트";
            return new Item(report.getId(), title, report.getPeriodStartDate(), report.getPeriodEndDate(),
                    report.getStatus(), report.getRequestedAt(), report.isDownloadable());
        }
    }

    public record PageInfo(int page, int size, long totalElements, int totalPages) {
    }

    public static ReportListResponse of(Page<Report> reportPage) {
        return new ReportListResponse(
                reportPage.getContent().stream().map(Item::of).toList(),
                new PageInfo(reportPage.getNumber(), reportPage.getSize(),
                        reportPage.getTotalElements(), reportPage.getTotalPages()));
    }
}
