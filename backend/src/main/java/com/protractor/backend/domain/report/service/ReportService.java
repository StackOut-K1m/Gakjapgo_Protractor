package com.protractor.backend.domain.report.service;

import com.protractor.backend.domain.report.dto.DailyStudyResponse;
import com.protractor.backend.domain.report.dto.ReportCreateRequest;
import com.protractor.backend.domain.report.dto.ReportCreateResponse;
import com.protractor.backend.domain.report.dto.ReportDetailResponse;
import com.protractor.backend.domain.report.dto.ReportListResponse;
import com.protractor.backend.domain.report.dto.WeeklyMetrics;
import com.protractor.backend.domain.report.dto.WeeklyReportSummaryResponse;
import com.protractor.backend.domain.report.entity.Report;
import com.protractor.backend.domain.report.entity.ReportStatus;
import com.protractor.backend.domain.report.repository.ReportRepository;
import com.protractor.backend.domain.report.storage.ReportStorage;
import com.protractor.backend.global.exception.BusinessException;
import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.time.temporal.ChronoUnit;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;

@Service
@RequiredArgsConstructor
public class ReportService {

    private static final DateTimeFormatter TITLE_DATE = DateTimeFormatter.ofPattern("yyyy.MM.dd");
    private static final int MAX_PERIOD_DAYS = 31;

    /**
     * 학습 캘린더 조회 기간 상한. 달력 한 화면이 6주 42칸이라 그만큼 필요하다(앞뒤 달 칸 포함).
     * 리포트 생성 상한(31일)과 따로 두는 이유는 이쪽은 LLM 호출이 없는 단순 조회라서다.
     */
    private static final int MAX_CALENDAR_DAYS = 42;

    private final ReportRepository reportRepository;
    private final ReportMetricsService metricsService;
    private final ReportGenerationService generationService;
    private final ReportStorage reportStorage;

    /**
     * 주간 리포트 데이터 조회. weekStart가 어느 요일이든 그 주의 월요일로 정규화해 월~일을 집계한다.
     * aiFeedback은 같은 기간의 COMPLETED 리포트가 있을 때 그 LLM 소견을 함께 내려준다(없으면 null).
     */
    public WeeklyReportSummaryResponse getSummary(Long memberId, LocalDate weekStartParam) {
        LocalDate weekStart = (weekStartParam != null ? weekStartParam : LocalDate.now()).with(DayOfWeek.MONDAY);
        WeeklyMetrics metrics = metricsService.collect(memberId, weekStart);
        String aiFeedback = reportRepository
                .findByPeriodAndStatusIn(memberId, weekStart, metrics.weekEnd(), List.of(ReportStatus.COMPLETED))
                .stream().findFirst()
                .map(Report::getSummaryText)
                .orElse(null);
        return WeeklyReportSummaryResponse.of(metrics, buildSummaryText(metrics), aiFeedback);
    }

    /**
     * 임의 기간의 하루 단위 학습 요약. 학습 캘린더가 보고 있는 달을 통째로 받아 간다.
     *
     * <p>
     * 기간 상한은 리포트 생성과 같은 값을 쓴다 — 달력 한 화면(6주 42칸)이 최대이고, 그보다 넓은
     * 요청은 화면이 아니라 데이터를 긁어 가려는 호출이다.
     */
    public List<DailyStudyResponse> getDailyStudy(Long memberId, LocalDate from, LocalDate to) {
        if (to.isBefore(from)) {
            throw new BusinessException(HttpStatus.BAD_REQUEST, "종료일이 시작일보다 앞설 수 없습니다.");
        }
        if (ChronoUnit.DAYS.between(from, to) + 1 > MAX_CALENDAR_DAYS) {
            throw new BusinessException(HttpStatus.BAD_REQUEST,
                    "조회 기간은 최대 " + MAX_CALENDAR_DAYS + "일입니다.");
        }
        return metricsService.collectDaily(memberId, from, to);
    }

    public ReportCreateResponse create(Long memberId, ReportCreateRequest request) {
        validatePeriod(request.from(), request.to());

        // 같은 기간이 이미 생성 중이면 새로 만들지 않고 그 건을 그대로 돌려준다(버튼 연타로 LLM 중복 호출 방지).
        List<Report> inProgress = reportRepository.findByPeriodAndStatusIn(memberId, request.from(), request.to(),
                List.of(ReportStatus.PENDING, ReportStatus.RUNNING));
        if (!inProgress.isEmpty()) {
            Report existing = inProgress.get(0);
            return new ReportCreateResponse(existing.getId(), existing.getStatus());
        }

        // 같은 기간의 완료본이 아직 살아 있으면 그것을 재사용한다. LLM 호출과 PDF 렌더는 수십 초·유료라,
        // 같은 주차를 다시 눌렀을 때 다시 만들 이유가 없다.
        //
        // 단, 기간이 아직 진행 중이면(종료일이 오늘 이후) 데이터가 계속 쌓이는 중이라 어제 만든
        // 스냅샷을 돌려주면 안 된다 — 목요일에 뽑은 리포트가 금요일 데이터를 영영 가리게 된다.
        // 그래서 진행 중인 기간은 "오늘 완성된 것"만 재사용하고, 날이 바뀌면 새로 만든다.
        // (끝난 기간은 데이터가 변하지 않으므로 기존대로 언제까지나 재사용한다)
        //
        // DB 행만 보고 재사용하면 파일이 사라진 경우 사용자가 다운로드 404 에서 막히고 되돌릴 방법이 없다.
        // 그래서 보관소에 실제로 있는지 확인하고, 없으면 아래로 내려가 새로 만든다.
        LocalDate today = LocalDate.now();
        Report reusable = reportRepository
                .findByPeriodAndStatusIn(memberId, request.from(), request.to(), List.of(ReportStatus.COMPLETED))
                .stream()
                .filter(r -> r.getPdfDeletedAt() == null && reportStorage.exists(r.getPdfUrl()))
                .filter(r -> r.getPeriodEndDate().isBefore(today)
                        || (r.getCompletedAt() != null && r.getCompletedAt().toLocalDate().isEqual(today)))
                .findFirst()
                .orElse(null);
        if (reusable != null) {
            return new ReportCreateResponse(reusable.getId(), reusable.getStatus());
        }

        // 학습 기록이 없는 기간은 만들지 않는다 — LLM 호출은 유료인데 결과물은 "기록이 없습니다"뿐인
        // 빈 리포트가 되고, 그 빈 스냅샷이 같은 기간 재사용 로직에 눌러앉아 나중에 기록이 생겨도 그걸 돌려준다.
        if (!metricsService.hasStudyData(memberId, request.from(), request.to())) {
            throw new BusinessException(HttpStatus.BAD_REQUEST,
                    "해당 기간에 학습 기록이 없어 리포트를 만들 수 없습니다. 스터디에 참여한 뒤 다시 시도해 주세요.");
        }

        String title = request.title() == null || request.title().isBlank()
                ? TITLE_DATE.format(request.from()) + " ~ " + TITLE_DATE.format(request.to()) + " 주간 리포트"
                : request.title().trim();

        // 같은 기간의 행이 이미 있으면 새로 쌓지 않고 그 행을 되살려 쓴다.
        //
        // 진행 중인 주차는 위 재사용 조건에서 "오늘 완성된 것"만 통과하므로, 날이 바뀔 때마다 다시
        // 만들게 되어 있다. 그때 행을 새로 만들면 목록에 같은 주차가 서너 줄씩 늘어선다 —
        // 사용자가 보기에 주차는 하나뿐이니 행도 하나여야 한다.
        //
        // 위에서 이미 걸러졌으므로 여기 오는 행은 진행 중이 아니다(PENDING/RUNNING 은 첫 분기에서
        // 반환됨). 남는 것은 낡은 완료본이거나 실패한 행이고, 둘 다 덮어써도 되는 자리다.
        List<Report> samePeriod = reportRepository
                .findByMemberIdAndPeriodStartDateAndPeriodEndDateOrderByIdDesc(memberId, request.from(),
                        request.to());
        if (!samePeriod.isEmpty()) {
            Report target = samePeriod.get(0);
            target.resetForRegeneration(title);
            reportRepository.saveAndFlush(target);
            generationService.generate(target.getId());
            return new ReportCreateResponse(target.getId(), target.getStatus());
        }

        // 트랜잭션을 걸지 않는 이유: save가 자체 트랜잭션으로 먼저 커밋된 뒤 비동기 생성을 시작해야
        // 비동기 스레드가 아직 커밋 안 된 행을 조회하지 못하는 경합이 생기지 않는다.
        Report saved = reportRepository.save(Report.request(memberId, title, request.from(), request.to()));
        generationService.generate(saved.getId());
        return new ReportCreateResponse(saved.getId(), saved.getStatus());
    }

    public ReportListResponse getMyReports(Long memberId, int page, int size) {
        // FAILED는 목록에서 뺀다 — 재시도할 때마다 실패 행이 쌓여 목록을 어지럽히기만 한다.
        // 생성 실패 안내는 FE 폴링이 단건 조회(getDetail)로 받으므로 목록에서 숨겨도 지장이 없다.
        //
        // 정렬은 요청 시각이 아니라 기간이다. 재생성이 기존 행을 되살려 쓰면서 요청 시각
        // (requested_at)은 처음 만든 때로 굳었는데, 그걸로 줄을 세우면 방금 다시 만든 이번 주가
        // 목록 아래에 남는다. 화면 이름부터가 "지난 주간 리포트"라 주차 순이 읽기에도 맞다.
        Page<Report> reports = reportRepository.findByMemberIdAndStatusNot(memberId, ReportStatus.FAILED,
                PageRequest.of(page, size, Sort.by(Sort.Direction.DESC, "periodStartDate", "id")));
        return ReportListResponse.of(reports);
    }

    public ReportDetailResponse getDetail(Long memberId, Long reportId) {
        return ReportDetailResponse.of(findMyReport(memberId, reportId));
    }

    /**
     * 다운로드용 PDF 와 파일 이름.
     *
     * <p>
     * 이름을 함께 돌려주는 이유: 브라우저는 blob 으로 받은 파일에 Content-Disposition 을 적용하지 않아
     * 프론트가 직접 이름을 정해야 한다. 서버와 프론트가 같은 규칙을 쓰도록 여기서 한 번만 만든다.
     */
    public record ReportPdf(byte[] content, String fileName) {
    }

    public ReportPdf downloadPdf(Long memberId, Long reportId) {
        Report report = findMyReport(memberId, reportId);
        // 열람 기한 차단은 없앴다(Report.isDownloadable 주석 참고) — 한 번 만든 리포트는 계속 받을 수 있다.
        if (!report.isCompleted()) {
            throw new BusinessException(HttpStatus.BAD_REQUEST,
                    "리포트가 아직 생성되지 않았습니다. (현재 상태: " + report.getStatus() + ")");
        }
        if (report.getPdfUrl() == null || report.getPdfDeletedAt() != null) {
            throw new BusinessException(HttpStatus.NOT_FOUND, "PDF 파일이 없거나 삭제되었습니다. 리포트를 다시 생성해 주세요.");
        }
        // 보관소는 S3 또는 로컬 디스크다. 보관 위치가 예전 형식이면(로컬 경로인데 지금은 S3) 없는 것으로 보고
        // 다시 생성하도록 안내한다.
        byte[] content = reportStorage.load(report.getPdfUrl())
                .orElseThrow(() -> new BusinessException(HttpStatus.NOT_FOUND,
                        "PDF 파일을 찾을 수 없습니다. 리포트를 다시 생성해 주세요."));
        return new ReportPdf(content,
                ReportStorage.fileName(report.getId(), report.getPeriodStartDate(), report.getPeriodEndDate()));
    }

    private Report findMyReport(Long memberId, Long reportId) {
        // 남의 리포트도 "없음"과 같은 404로 응답해 존재 여부를 흘리지 않는다.
        return reportRepository.findByIdAndMemberId(reportId, memberId)
                .orElseThrow(() -> new BusinessException(HttpStatus.NOT_FOUND, "리포트를 찾을 수 없습니다."));
    }

    private void validatePeriod(LocalDate from, LocalDate to) {
        if (to.isBefore(from)) {
            throw new BusinessException(HttpStatus.BAD_REQUEST, "종료일이 시작일보다 앞설 수 없습니다.");
        }
        if (ChronoUnit.DAYS.between(from, to) + 1 > MAX_PERIOD_DAYS) {
            throw new BusinessException(HttpStatus.BAD_REQUEST, "리포트 기간은 최대 " + MAX_PERIOD_DAYS + "일입니다.");
        }
    }

    /**
     * 카드에 항상 보여줄 한 줄 요약(규칙 기반). LLM 소견(aiFeedback)과 달리 리포트 생성 없이도 내려간다.
     * 수치가 있는 대표 변화 하나를 골라 문장으로 만든다.
     */
    private String buildSummaryText(WeeklyMetrics m) {
        if (m.totalStudySeconds() == 0) {
            return "이번 주 학습 기록이 아직 없습니다. 스터디에 참여하면 자세 분석이 시작됩니다.";
        }
        // 목표를 정해 둔 사용자에게는 목표 달성이 가장 궁금한 한 줄이다.
        if (m.goalAchievementRate() != null && m.goalAchievementRate() >= 100) {
            return "이번 주 학습 목표를 달성했습니다(" + m.goalAchievementRate() + "%). 다음 주도 이 흐름을 이어가 보세요.";
        }
        long cur = m.postureBreakdown().forwardHead();
        long prev = m.prevPostureBreakdown().forwardHead();
        if (prev > 0 && cur < prev) {
            return "거북목 감지 횟수가 전주 대비 " + percent(prev - cur, prev) + "% 감소했습니다. 목 스트레칭을 꾸준히 유지하세요.";
        }
        if (prev > 0 && cur > prev) {
            return "거북목 감지 횟수가 전주 대비 " + percent(cur - prev, prev) + "% 증가했습니다. 모니터 높이를 점검하고 목 스트레칭을 챙겨보세요.";
        }
        // 전주 값이 null이면 기록이 없던 주다 — 비교 문장을 만들지 않는다(가짜 개선 방지).
        if (m.prevGoodPostureRatio() != null && m.goodPostureRatio() != null
                && m.goodPostureRatio() > m.prevGoodPostureRatio()) {
            return "바른 자세 유지율이 전주 " + m.prevGoodPostureRatio() + "%에서 " + m.goodPostureRatio()
                    + "%로 개선되었습니다. 좋은 흐름을 이어가세요.";
        }
        if (m.goodPostureRatio() == null) {
            return "이번 주 학습 시간은 기록됐지만 자세 측정 기록이 없습니다. 카메라를 켜고 공부하면 자세 분석이 시작됩니다.";
        }
        return "이번 주 바른 자세 유지율은 " + m.goodPostureRatio() + "%입니다. 스트레칭과 틈틈이 쉬는 습관으로 꾸준히 관리해 보세요.";
    }

    private long percent(long diff, long base) {
        return Math.round(diff * 100.0 / base);
    }
}
