package com.protractor.backend.domain.report.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.protractor.backend.domain.report.dto.WeeklyMetrics;
import com.protractor.backend.domain.report.entity.Report;
import com.protractor.backend.domain.report.repository.ReportRepository;
import com.protractor.backend.domain.report.storage.ReportStorage;
import com.protractor.backend.domain.stretching.repository.StretchingRepository;
import java.util.List;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;

/**
 * 리포트 생성 비동기 파이프라인: RUNNING 전이 → 주간 집계 → GMS 소견 → 차트 → PDF 저장 → COMPLETED.
 * 어느 단계에서 실패하든 FAILED + error_message로 남겨 FE 폴링이 끝나게 한다.
 *
 * <p>
 * LLM 호출·PDF 렌더는 수십 초짜리라 DB 트랜잭션을 잡지 않은 채 진행하고,
 * 상태 저장 순간에만 짧게 저장한다(saveAndFlush).
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class ReportGenerationService {

    private final ReportRepository reportRepository;
    private final ReportMetricsService metricsService;
    private final GmsClient gmsClient;
    private final ReportChartRenderer chartRenderer;
    private final ReportPdfRenderer pdfRenderer;
    private final ObjectMapper objectMapper;
    private final ReportStorage reportStorage;
    private final StretchingRepository stretchingRepository;

    @Async("reportTaskExecutor")
    public void generate(Long reportId) {
        Report report = reportRepository.findById(reportId).orElse(null);
        if (report == null) {
            log.error("리포트 생성 시작 실패 — 행이 없습니다: reportId={}", reportId);
            return;
        }

        try {
            report.markRunning();
            reportRepository.saveAndFlush(report);

            WeeklyMetrics metrics = metricsService.collect(report.getMemberId(),
                    report.getPeriodStartDate(), report.getPeriodEndDate());
            String opinion = gmsClient.generateOpinion(ReportPrompt.SYSTEM_PROMPT,
                    ReportPrompt.buildUserPrompt(metrics, recommendedStretchings()));
            List<byte[]> charts = chartRenderer.render(metrics);
            byte[] pdf = pdfRenderer.render(metrics, opinion, charts);
            String location = reportStorage.store(report.getMemberId(), report.getId(),
                    report.getPeriodStartDate(), report.getPeriodEndDate(), pdf);

            report.complete(opinion, location, gmsClient.model(), ReportPrompt.PROMPT_VERSION,
                    objectMapper.writeValueAsString(metrics));
            reportRepository.saveAndFlush(report);
            log.info("리포트 생성 완료: reportId={}, pdf={}", reportId, location);
        } catch (Exception e) {
            log.error("리포트 생성 실패: reportId={}", reportId, e);
            try {
                report.fail(e.getMessage() != null ? e.getMessage() : e.getClass().getSimpleName());
                reportRepository.saveAndFlush(report);
            } catch (Exception saveError) {
                // 실패 상태 저장까지 실패하면(예: DB 다운) 로그만 남긴다. 행은 RUNNING으로 남지만 재요청으로 복구 가능하다.
                log.error("리포트 실패 상태 저장도 실패: reportId={}", reportId, saveError);
            }
        }
    }

    /**
     * LLM에게 줄 추천 스트레칭 목록 — DB(stretchings)의 활성 동작을 "이름 (부위, N초 유지)" 줄로 만든다.
     * 프롬프트에 동작 이름을 하드코딩하면 시드가 바뀔 때마다 프롬프트가 낡는다(실제로 7종→6종 개편 때 어긋났다).
     */
    private List<String> recommendedStretchings() {
        return stretchingRepository.findByEnabledTrueOrderBySortOrderAscIdAsc().stream()
                .map(s -> "%s (%s, %d초 유지)".formatted(s.getName(), partLabel(s.getTargetPart()), s.getHoldSeconds()))
                .toList();
    }

    private String partLabel(String targetPart) {
        return switch (targetPart == null ? "" : targetPart) {
            case "NECK" -> "목";
            case "SHOULDER" -> "어깨";
            default -> targetPart;
        };
    }
}
