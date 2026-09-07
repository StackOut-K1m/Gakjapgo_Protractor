package com.protractor.backend.domain.report.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.LocalDate;
import java.time.LocalDateTime;
import lombok.AccessLevel;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.annotations.UpdateTimestamp;
import org.hibernate.type.SqlTypes;

/**
 * 주간 AI 리포트 한 건. 공식 스키마 {@code reports} 매핑.
 *
 * <p>
 * POST 시 PENDING으로 저장되고, 비동기 파이프라인이 RUNNING → COMPLETED/FAILED로 전이시킨다.
 * 소견 원문(summary_text)과 생성에 쓴 집계값(input_data)을 함께 남겨 나중에 결과를 재현·검증할 수 있게 한다.
 */
@Entity
@Table(name = "reports")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor(access = AccessLevel.PRIVATE)
@Builder
public class Report {

    /** error_message 컬럼 길이(VARCHAR 1000). 초과분은 잘라 저장한다. */
    private static final int ERROR_MESSAGE_MAX = 1000;

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "report_id")
    private Long id;

    @Column(name = "member_id", nullable = false)
    private Long memberId;

    @Column(name = "report_title", length = 200)
    private String reportTitle;

    @Column(name = "period_start_date", nullable = false)
    private LocalDate periodStartDate;

    @Column(name = "period_end_date", nullable = false)
    private LocalDate periodEndDate;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false)
    private ReportStatus status;

    /** 생성에 사용한 주간 집계값(JSON). 소견 수치의 근거를 남긴다. */
    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "input_data")
    private String inputData;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "summary_metrics")
    private String summaryMetrics;

    /** LLM이 생성한 소견 원문(마크다운). 상세 페이지의 AI 피드백으로도 내려간다. */
    @Column(name = "summary_text")
    private String summaryText;

    /** 생성된 PDF의 서버 파일 경로. S3 도입 시 외부 URL로 대체된다(그때 pdf_url_expires_at 사용). */
    @Column(name = "pdf_url", length = 1000)
    private String pdfUrl;

    @Column(name = "pdf_url_expires_at")
    private LocalDateTime pdfUrlExpiresAt;

    @Column(name = "pdf_deleted_at")
    private LocalDateTime pdfDeletedAt;

    @Column(name = "model_name", length = 100)
    private String modelName;

    @Column(name = "prompt_version", length = 50)
    private String promptVersion;

    @Column(name = "error_message", length = 1000)
    private String errorMessage;

    @CreationTimestamp
    @Column(name = "requested_at", updatable = false)
    private LocalDateTime requestedAt;

    @Column(name = "started_at")
    private LocalDateTime startedAt;

    @Column(name = "completed_at")
    private LocalDateTime completedAt;

    @UpdateTimestamp
    @Column(name = "updated_at")
    private LocalDateTime updatedAt;

    /** 생성 요청 접수. 제목이 비어 있으면 컨트롤러 쪽에서 기본 제목을 만들어 넘긴다. */
    public static Report request(Long memberId, String title, LocalDate startDate, LocalDate endDate) {
        return Report.builder()
                .memberId(memberId)
                .reportTitle(title)
                .periodStartDate(startDate)
                .periodEndDate(endDate)
                .status(ReportStatus.PENDING)
                .build();
    }

    /**
     * 같은 기간의 리포트를 다시 만들기 위해 이 행을 되돌린다.
     *
     * <p>
     * 새 행을 만들지 않는 이유: 진행 중인 주차는 날이 바뀔 때마다 다시 만들게 되어 있어서, 행을
     * 새로 쌓으면 같은 주차가 목록에 서너 줄씩 늘어선다. 사용자가 보기에 주차는 하나뿐이므로
     * 행도 하나여야 한다.
     *
     * <p>
     * PDF 파일 이름이 {@code reportId + 기간}이라(ReportStorage.fileName) 같은 행을 다시 쓰면
     * 파일도 같은 자리에 덮어써진다. 새 행으로 만들면 이전 파일이 보관소에 그대로 남는데,
     * 지우는 수단이 없어 계속 쌓인다.
     *
     * <p>
     * <b>소견·PDF 는 지우지 않는다.</b> 생성이 실패하면 이 행은 FAILED 로 끝나는데, 그때 이전
     * 결과까지 날아가면 멀쩡히 받던 리포트를 재생성 한 번으로 잃는다. 성공하면 {@link #complete}
     * 가 어차피 전부 덮어쓴다.
     */
    public void resetForRegeneration(String title) {
        this.reportTitle = title;
        this.status = ReportStatus.PENDING;
        this.errorMessage = null;
        this.startedAt = null;
        this.completedAt = null;
    }

    public void markRunning() {
        this.status = ReportStatus.RUNNING;
        this.startedAt = LocalDateTime.now();
        this.errorMessage = null;
    }

    public void complete(String summaryText, String pdfPath, String modelName, String promptVersion,
            String inputDataJson) {
        this.status = ReportStatus.COMPLETED;
        this.summaryText = summaryText;
        this.pdfUrl = pdfPath;
        this.modelName = modelName;
        this.promptVersion = promptVersion;
        this.inputData = inputDataJson;
        this.completedAt = LocalDateTime.now();
    }

    public void fail(String message) {
        this.status = ReportStatus.FAILED;
        this.errorMessage = message != null && message.length() > ERROR_MESSAGE_MAX
                ? message.substring(0, ERROR_MESSAGE_MAX)
                : message;
    }

    public boolean isInProgress() {
        return this.status == ReportStatus.PENDING || this.status == ReportStatus.RUNNING;
    }

    public boolean isCompleted() {
        return this.status == ReportStatus.COMPLETED;
    }

    /**
     * 지금 다운로드 요청이 성공할 수 있는 상태인지. FE가 목록·상세에서 버튼을 "다운로드/재생성"으로 나눠 그리는 근거다.
     *
     * <p>
     * 열람 기한은 없다 — 예전에는 기간 종료 + 7일이 지나면 막았는데(viewableUntil), 한 번 만든
     * 리포트는 계속 받을 수 있어야 한다는 정책으로 걷어냈다. 제한이 필요해지면 생성 쪽에 두기로 했다.
     *
     * <p>
     * 보관소에 파일이 실제로 있는지(S3 HEAD)는 확인하지 않는다 — 목록 행마다 원격 호출이 나가면 조회가 느려진다.
     * 삭제 표시(pdfDeletedAt) 없이 파일만 사라진 드문 경우는 다운로드 시점의 404 안내가 잡는다.
     */
    public boolean isDownloadable() {
        return isCompleted() && pdfUrl != null && pdfDeletedAt == null;
    }
}
