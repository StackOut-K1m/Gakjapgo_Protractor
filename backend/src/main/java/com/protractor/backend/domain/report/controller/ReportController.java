package com.protractor.backend.domain.report.controller;

import com.protractor.backend.domain.report.dto.DailyStudyResponse;
import com.protractor.backend.domain.report.dto.ReportCreateRequest;
import com.protractor.backend.domain.report.dto.ReportCreateResponse;
import com.protractor.backend.domain.report.dto.ReportDetailResponse;
import com.protractor.backend.domain.report.dto.ReportListResponse;
import com.protractor.backend.domain.report.dto.WeeklyReportSummaryResponse;
import com.protractor.backend.domain.report.service.ReportService;
import com.protractor.backend.global.exception.BusinessException;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import java.time.LocalDate;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@Tag(name = "Report", description = "주간 AI 자세 리포트 API")
@RestController
@RequestMapping("/api/v1/reports/me")
@RequiredArgsConstructor
public class ReportController {

    private final ReportService reportService;

    @Operation(summary = "주간 리포트 데이터 조회 (마이페이지 카드·상세 페이지 공용, weekStart 생략 시 이번 주)")
    @GetMapping("/summary")
    public ResponseEntity<WeeklyReportSummaryResponse> getSummary(
            Authentication authentication,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate weekStart,
            @RequestParam(defaultValue = "WEEKLY") String period) {
        // 명세의 period 파라미터는 주간(WEEKLY)만 우선 지원한다. 일간이 필요해지면 이 검증부터 푼다.
        if (!"WEEKLY".equalsIgnoreCase(period)) {
            throw new BusinessException(HttpStatus.BAD_REQUEST, "period는 WEEKLY만 지원합니다.");
        }
        Long memberId = (Long) authentication.getPrincipal();
        return ResponseEntity.ok(reportService.getSummary(memberId, weekStart));
    }

    @Operation(summary = "기간별 일자 학습 요약 조회 (학습 캘린더 — 최대 42일, 기록 없는 날은 빠진다)")
    @GetMapping("/daily")
    public ResponseEntity<List<DailyStudyResponse>> getDailyStudy(
            Authentication authentication,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to) {
        Long memberId = (Long) authentication.getPrincipal();
        return ResponseEntity.ok(reportService.getDailyStudy(memberId, from, to));
    }

    @Operation(summary = "PDF 리포트 생성 요청 (202 Accepted — 비동기 생성 시작, reportId로 상태 폴링)")
    @PostMapping
    public ResponseEntity<ReportCreateResponse> create(Authentication authentication,
            @Valid @RequestBody ReportCreateRequest request) {
        Long memberId = (Long) authentication.getPrincipal();
        return ResponseEntity.accepted().body(reportService.create(memberId, request));
    }

    @Operation(summary = "내 리포트 목록 조회 (최근 요청 순)")
    @GetMapping
    public ResponseEntity<ReportListResponse> getMyReports(
            Authentication authentication,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "10") int size) {
        Long memberId = (Long) authentication.getPrincipal();
        return ResponseEntity.ok(reportService.getMyReports(memberId, page, size));
    }

    @Operation(summary = "리포트 상태·상세 조회 (생성 완료 폴링용)")
    @GetMapping("/{reportId}")
    public ResponseEntity<ReportDetailResponse> getDetail(Authentication authentication,
            @PathVariable Long reportId) {
        Long memberId = (Long) authentication.getPrincipal();
        return ResponseEntity.ok(reportService.getDetail(memberId, reportId));
    }

    @Operation(summary = "리포트 PDF 다운로드 (COMPLETED 상태에서만 가능)")
    @GetMapping("/{reportId}/download")
    public ResponseEntity<byte[]> download(Authentication authentication, @PathVariable Long reportId) {
        Long memberId = (Long) authentication.getPrincipal();
        ReportService.ReportPdf pdf = reportService.downloadPdf(memberId, reportId);
        return ResponseEntity.ok()
                .contentType(MediaType.APPLICATION_PDF)
                // 파일 이름에 리포트 기간이 들어간다(2026-07-20_2026-07-26_report-5.pdf).
                // 프론트는 blob 으로 받아 이 헤더를 쓰지 못하므로 X-Report-Filename 으로도 내려준다.
                .header(HttpHeaders.CONTENT_DISPOSITION,
                        "attachment; filename=\"" + pdf.fileName() + "\"")
                .header("X-Report-Filename", pdf.fileName())
                .header(HttpHeaders.ACCESS_CONTROL_EXPOSE_HEADERS, "X-Report-Filename")
                .body(pdf.content());
    }
}
