package com.protractor.backend.domain.report.service;

import com.openhtmltopdf.outputdevice.helper.BaseRendererBuilder;
import com.openhtmltopdf.pdfboxout.PdfRendererBuilder;
import com.protractor.backend.domain.report.dto.WeeklyMetrics;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.IOException;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.Base64;
import java.util.List;
import org.commonmark.Extension;
import org.commonmark.ext.gfm.tables.TablesExtension;
import org.commonmark.parser.Parser;
import org.commonmark.renderer.html.HtmlRenderer;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/**
 * 주간 리포트 PDF 렌더러 — "스탯 카드 대시보드" 레이아웃(2026-08-05 사용자 시안 A안 채택).
 * 구성 = 헤더(제목+기간) → 핵심 카드 4장 → 부위 점수·감지 2칼럼 → 차트 4장(+LLM 판독) → LLM 소견 → 지표 정의.
 *
 * <p>
 * 수치는 전부 코드가 그린다(LLM에게 표를 맡기면 옮겨 적다 틀릴 수 있다 — LLM은 해석 문장만).
 * 색은 FE 디자인 토큰(frontend/src/styles/variables.css)과 같은 값을 쓴다.
 *
 * <p>
 * openhtmltopdf 제약: flex/grid·calc()·그림자·그라데이션이 없다. 배치는 table, 게이지 바는
 * 중첩 div의 % 폭으로 만든다. border-radius는 블록 박스에만 확실히 먹어서 카드류는 td 안의 div에 입힌다.
 */
@Component
public class ReportPdfRenderer {

    private static final DateTimeFormatter DOT_DATE = DateTimeFormatter.ofPattern("yyyy.MM.dd");

    /** openhtmltopdf는 잘 닫힌 XHTML만 받는다. CSS는 이 틀 안에 전부 인라인으로 둔다. */
    private static final String HTML_HEAD = """
            <html>
            <head>
            <style>
            /* 색 = FE 토큰: text #101828 / secondary #475467 / muted #98a2b3 / border #d0d5dd
               / line #e4e7ec / primary #2d8c3c / primary-light #e8f5e9 / warn #f59e0b / danger #f04438
               초록은 primary 한 톤만 쓴다(FE의 네온 ok색 #1bbb05는 PDF에서 톤이 튀어 제외) */
            @page { size: A4; margin: 16mm 14mm; }
            body { font-family: 'ReportKr'; font-size: 10.5pt; color: #101828; }
            h2 { font-size: 12.5pt; margin: 15pt 0 7pt 0; padding-bottom: 4pt; border-bottom: 0.7pt solid #e4e7ec; }
            p { margin: 4pt 0; line-height: 1.55; }

            /* 밑줄은 background 채운 div로 — openhtmltopdf가 table/td의 border-bottom을 셀 폭만큼만 그린다 */
            .header { width: 100%; border-collapse: collapse; }
            .header td { border: none; padding: 0 0 8pt 0; vertical-align: bottom; }
            .header-rule { height: 1.6pt; background-color: #101828; margin: 0 0 12pt 0; }
            .title { font-size: 19pt; font-weight: bold; letter-spacing: -0.3pt; }
            .period-cell { text-align: right; }
            .period { display: inline-block; font-size: 8.5pt; color: #475467;
                      border: 0.8pt solid #e4e7ec; border-radius: 10pt; padding: 2pt 10pt; }

            /* 스탯 카드 4장 — 실제 표로 배치하고 카드 스타일은 안쪽 div에 입힌다 */
            .cards { width: 100%; border-collapse: separate; border-spacing: 5pt 0; margin: 0 0 8pt 0; }
            .cards td { border: none; padding: 0; width: 25%; vertical-align: top; }
            .card { background-color: #f8fafb; border: 0.8pt solid #eef1f4; border-radius: 6pt;
                    padding: 8pt 10pt 9pt 10pt; }
            .card .k { font-size: 8.5pt; color: #667085; }
            .card .v { font-size: 16.5pt; font-weight: bold; letter-spacing: -0.3pt; margin: 2pt 0 3pt 0; }
            .card .unit { font-size: 9pt; font-weight: normal; color: #98a2b3; }
            .pill { display: inline-block; font-size: 7.8pt; font-weight: bold; color: #2d8c3c;
                    background-color: #e8f5e9; border-radius: 8pt; padding: 1pt 7pt; }
            .pill.gray { color: #667085; background-color: #f2f4f7; }
            .pill.bad { color: #b42318; background-color: #fee4e2; }

            /* 부위 점수 · 감지 2칼럼 */
            .cols { width: 100%; border-collapse: separate; border-spacing: 5pt 0; margin: 0 0 4pt 0; }
            .cols td.slot { border: none; padding: 0; width: 50%; vertical-align: top; }
            .colcard { border: 0.8pt solid #eef1f4; border-radius: 6pt; padding: 8pt 11pt 9pt 11pt; }
            .colcard h4 { margin: 0 0 6pt 0; font-size: 9pt; color: #475467; }
            .colcard h4 .sub { color: #98a2b3; font-weight: normal; }
            .bars { width: 100%; border-collapse: collapse; }
            .bars td { border: none; padding: 3pt 0; font-size: 9pt; }
            .bars td.blab { width: 46pt; color: #475467; }
            .bars td.bnum { width: 22pt; font-weight: bold; font-size: 9.5pt; }
            .track { background-color: #f2f4f7; border-radius: 4pt; height: 6pt; }
            .fillbar { height: 6pt; border-radius: 4pt; }
            .kv { font-size: 9pt; margin: 4pt 0; color: #475467; line-height: 1.5; }
            .kv b { color: #101828; }
            .hint { color: #98a2b3; font-size: 7.8pt; margin-top: 6pt; }

            .chart { margin: 0 0 10pt 0; page-break-inside: avoid; }
            .chart-note { margin: 2pt 0 0 0; padding: 5pt 8pt 5pt 9pt;
                          border-left: 2.2pt solid #2d8c3c; background-color: #f6faf7;
                          font-size: 9.5pt; line-height: 1.5; color: #475467; }
            .chart-note p { margin: 0; }
            img { width: 100%; }
            table.md { width: 100%; border-collapse: collapse; margin: 6pt 0; }
            table.md th, table.md td { border-bottom: 0.6pt solid #e4e7ec; padding: 5pt 7pt; font-size: 9.5pt; text-align: left; }
            .legend { color: #98a2b3; font-size: 8.5pt; line-height: 1.6; margin: 3pt 0 0 0; }
            .legend p { margin: 1.5pt 0; }
            .footnote { color: #98a2b3; font-size: 8.5pt; margin-top: 10pt; }
            ul { margin: 4pt 0 8pt 16pt; padding: 0; }
            li { margin: 2.5pt 0; line-height: 1.55; }
            </style>
            </head>
            <body>
            """;

    private final String fontPath;
    private final String fontBoldPath;

    public ReportPdfRenderer(@Value("${app.report.font-path}") String fontPath,
            @Value("${app.report.font-bold-path}") String fontBoldPath) {
        this.fontPath = fontPath;
        this.fontBoldPath = fontBoldPath;
    }

    public byte[] render(WeeklyMetrics m, String opinionMarkdown, List<byte[]> chartPngs) throws IOException {
        File font = new File(fontPath);
        if (!font.exists()) {
            throw new IllegalStateException("한글 폰트 파일이 없습니다: " + fontPath + " (REPORT_FONT_PATH 환경변수로 지정)");
        }

        // 그래프별 판독을 떼어내 각 그래프 아래에 싣고, 남은 소견은 뒷장에 그대로 둔다.
        ReportOpinion opinion = ReportOpinion.parse(opinionMarkdown);
        String html = buildHtml(m, opinion, chartPngs);
        try (ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            PdfRendererBuilder builder = new PdfRendererBuilder();
            builder.useFastMode();
            builder.useFont(font, "ReportKr", 400, BaseRendererBuilder.FontStyle.NORMAL, true);
            File bold = new File(fontBoldPath);
            if (bold.exists()) {
                builder.useFont(bold, "ReportKr", 700, BaseRendererBuilder.FontStyle.NORMAL, true);
            }
            builder.withHtmlContent(html, null);
            builder.toStream(out);
            builder.run();
            return out.toByteArray();
        }
    }

    /**
     * LLM 소견 마크다운 → HTML. escapeHtml로 LLM이 섞어 낼 수 있는 원시 HTML을 이스케이프해
     * XHTML 파서가 깨지지 않게 한다(표는 GFM 확장으로 렌더).
     */
    private String markdownToHtml(String markdown) {
        List<Extension> extensions = List.of(TablesExtension.create());
        Parser parser = Parser.builder().extensions(extensions).build();
        HtmlRenderer renderer = HtmlRenderer.builder().extensions(extensions).escapeHtml(true).build();
        return renderer.render(parser.parse(markdown));
    }

    private String buildHtml(WeeklyMetrics m, ReportOpinion opinion, List<byte[]> chartPngs) {
        StringBuilder charts = new StringBuilder();
        for (int i = 0; i < chartPngs.size(); i++) {
            charts.append("<div class=\"chart\"><img src=\"data:image/png;base64,")
                    .append(Base64.getEncoder().encodeToString(chartPngs.get(i)))
                    .append("\"/>\n");
            String note = opinion.noteFor(i);
            if (note != null) {
                charts.append("<div class=\"chart-note\">").append(markdownToHtml(note)).append("</div>\n");
            }
            charts.append("</div>\n");
        }

        return HTML_HEAD
                + headerBlock(m)
                + statCards(m)
                + detailColumns(m)
                + "<h2>주간 지표 그래프</h2>\n"
                + charts
                + markdownToHtml(opinion.restMarkdown())
                + "<h2>지표 정의</h2>\n"
                + metricLegend()
                + "<p class=\"footnote\">이 리포트는 각잡고에 기록된 학습·자세 데이터를 바탕으로 자동 생성되었습니다."
                + " 의학적 진단이 아니며, 통증이 있다면 전문가와 상담하세요.</p>\n"
                + "</body></html>";
    }

    private String headerBlock(WeeklyMetrics m) {
        return "<table class=\"header\"><tr>"
                + "<td><span class=\"title\">주간 학습·자세 리포트</span></td>"
                + "<td class=\"period-cell\"><span class=\"period\">" + DOT_DATE.format(m.weekStart())
                + " – " + DOT_DATE.format(m.weekEnd()) + " · 생성 " + DOT_DATE.format(LocalDate.now())
                + " · 각잡고</span></td>"
                + "</tr></table>\n<div class=\"header-rule\"></div>\n";
    }

    /** 핵심 카드 4장 — 순공부 / 집중률 / 유지율(전주 배지) / 목표 달성률. */
    private String statCards(WeeklyMetrics m) {
        String focused = card("순공부 시간", bigTime(m.focusedSeconds()),
                pill("gray", "총 학습 " + hoursMinutes(m.totalStudySeconds())));

        String focus = m.focusScore() == null
                ? card("학습 집중률", dash(), pill("gray", "기록 없음"))
                : card("학습 집중률", big(String.valueOf(m.focusScore()), "/100"),
                        pill("gray", "자리비움 " + hoursMinutes(m.awaySeconds())));

        String ratio;
        if (m.goodPostureRatio() == null) {
            ratio = card("바른 자세 유지율", dash(), pill("gray", "기록 없음"));
        } else if (m.prevGoodPostureRatio() == null) {
            ratio = card("바른 자세 유지율", big(String.valueOf(m.goodPostureRatio()), "%"),
                    pill("gray", "첫 기록 주"));
        } else {
            int diff = m.goodPostureRatio() - m.prevGoodPostureRatio();
            String badge = diff > 0 ? pill("", "▲ " + diff + "%p 전주")
                    : diff < 0 ? pill("bad", "▼ " + Math.abs(diff) + "%p 전주")
                    : pill("gray", "전주와 동일");
            ratio = card("바른 자세 유지율", big(String.valueOf(m.goodPostureRatio()), "%"), badge);
        }

        String goal;
        if (m.weeklyGoalMinutes() == null) {
            goal = card("목표 달성률", dash(), pill("gray", "목표 미설정"));
        } else if (m.goalAchievementRate() == null) {
            goal = card("목표 달성률", dash(), pill("gray", "주 단위 기간 아님"));
        } else {
            String badge = m.goalAchievementRate() >= 100 ? pill("", "목표 달성")
                    : pill("gray", "주 " + String.format("%,d", m.weeklyGoalMinutes()) + "분 목표");
            goal = card("목표 달성률", big(String.valueOf(m.goalAchievementRate()), "%"), badge);
        }

        return "<table class=\"cards\"><tr>"
                + "<td>" + focused + "</td><td>" + focus + "</td><td>" + ratio + "</td><td>" + goal + "</td>"
                + "</tr></table>\n";
    }

    /** 부위별 점수(게이지 바) + 집중을 깬 순간, 두 칼럼. */
    private String detailColumns(WeeklyMetrics m) {
        StringBuilder left = new StringBuilder();
        left.append("<div class=\"colcard\"><h4>부위별 자세 점수 <span class=\"sub\">· 100점 만점</span></h4>");
        left.append("<table class=\"bars\">");
        left.append(barRow("목", m.bodyPartScores().neck()));
        left.append(barRow("턱 괴기", m.bodyPartScores().chinRest()));
        left.append(barRow("어깨 균형", m.bodyPartScores().shoulderTilt()));
        left.append("</table>");
        left.append("<div class=\"kv\" style=\"margin-top:6pt\">자세 종합 <b>")
                .append(m.totalScore() == null ? "기록 없음" : m.totalScore() + "점").append("</b>");
        if (m.totalScore() != null && m.prevTotalScore() != null) {
            left.append(" <span style=\"color:#98a2b3\">(전주 ").append(m.prevTotalScore()).append("점)</span>");
        } else if (m.totalScore() != null) {
            left.append(" <span style=\"color:#98a2b3\">(첫 기록 주)</span>");
        }
        left.append("</div></div>");

        WeeklyMetrics.PostureBreakdown b = m.postureBreakdown();
        StringBuilder right = new StringBuilder();
        right.append("<div class=\"colcard\"><h4>집중을 깬 순간</h4>");
        right.append("<div class=\"kv\">나쁜 자세 <b>").append(m.eventCounts().badPosture())
                .append("회</b> <span style=\"color:#98a2b3\">· 거북목 ").append(b.forwardHead())
                .append(" · 턱 괴기 ").append(b.chinRest())
                .append(" · 어깨 ").append(b.shoulderTilt());
        if (b.otherPosture() > 0) {
            right.append(" · 기타 ").append(b.otherPosture());
        }
        right.append("</span></div>");
        right.append("<div class=\"kv\">졸음 <b>").append(b.drowsy()).append("회</b> · 휴대폰 <b>")
                .append(b.phoneUse()).append("회</b>");
        if (m.eventCounts().phoneUseSeconds() > 0) {
            right.append(" <span style=\"color:#98a2b3\">(총 ")
                    .append(hoursMinutes(m.eventCounts().phoneUseSeconds())).append(")</span>");
        }
        right.append("</div>");
        right.append("<div class=\"kv\">스트레칭 <b>").append(m.stretchingCompletedCount()).append("/")
                .append(m.stretchingAttemptCount()).append("회</b> 완료");
        if (m.stretchingAttemptCount() == 0) {
            right.append(" <span style=\"color:#98a2b3\">· 알림 없었음</span>");
        }
        right.append("</div>");
        right.append("<div class=\"hint\">같은 나쁜 자세가 10초 이상 이어졌을 때만 1회로 확정됩니다</div>");
        right.append("</div>");

        return "<table class=\"cols\"><tr>"
                + "<td class=\"slot\">" + left + "</td><td class=\"slot\">" + right + "</td>"
                + "</tr></table>\n";
    }

    /** 게이지 바 한 줄. 점수 등급색은 FE reportGrade.ts와 동일(85 이상 ok, 70 이상 warning, 미만 danger). */
    private String barRow(String label, Integer score) {
        if (score == null) {
            return "<tr><td class=\"blab\">" + label + "</td><td class=\"bnum\">—</td>"
                    + "<td><div class=\"track\"></div></td></tr>";
        }
        String color = score >= 85 ? "#2d8c3c" : score >= 70 ? "#f59e0b" : "#f04438";
        int width = Math.max(0, Math.min(100, score));
        return "<tr><td class=\"blab\">" + label + "</td><td class=\"bnum\">" + score + "</td>"
                + "<td><div class=\"track\"><div class=\"fillbar\" style=\"width:" + width
                + "%;background-color:" + color + "\"></div></div></td></tr>";
    }

    private String card(String label, String value, String badge) {
        return "<div class=\"card\"><div class=\"k\">" + label + "</div>"
                + "<div class=\"v\">" + value + "</div>" + badge + "</div>";
    }

    private String big(String number, String unit) {
        return number + "<span class=\"unit\">" + unit + "</span>";
    }

    private String dash() {
        return "<span style=\"color:#98a2b3\">—</span>";
    }

    /** "6시간 50분"을 카드용 큰 숫자(단위는 작게)로. */
    private String bigTime(long seconds) {
        long totalMinutes = Math.round(seconds / 60.0);
        long h = totalMinutes / 60;
        long minute = totalMinutes % 60;
        if (h == 0) {
            return big(String.valueOf(minute), "분");
        }
        if (minute == 0) {
            return big(String.valueOf(h), "시간");
        }
        return h + "<span class=\"unit\">시간</span> " + minute + "<span class=\"unit\">분</span>";
    }

    private String pill(String tone, String text) {
        String cls = tone.isEmpty() ? "pill" : "pill " + tone;
        return "<span class=\"" + cls + "\">" + text + "</span>";
    }

    /**
     * 지표 정의·계산식 — 마지막 페이지(소견 뒤)에 둔다. 1페이지는 카드가 말하게 하고, 정의가 궁금한
     * 사용자만 찾아 읽는 배치(시안 A안 채택 시 함께 결정). 문구를 바꾸면 화면(WeeklyReportPage 지표
     * 설명 카드)·계산 코드(StudyRecordService)와 어긋나지 않는지 볼 것.
     */
    private String metricLegend() {
        return """
                <div class="legend">
                <p>· 순공부 시간 — 카메라를 켜고 실제로 집중한 시간. 휴식·자리비움 시간은 들어가지 않습니다.</p>
                <p>· 학습 집중률 = 순공부 ÷ (순공부 + 자리비움) × 100 — 자리에 있어야 했던 시간 중 실제로 집중한 비율. 방이 정한 휴식은 빼고 계산합니다.</p>
                <p>· 바른 자세 유지율 = (순공부 - 나쁜 자세 시간) ÷ 순공부 × 100 — 공부하는 동안 바른 자세를 지킨 시간의 비율. 10초 미만의 짧은 흐트러짐 시간도 포함됩니다.</p>
                <p>· 집중을 깬 순간(횟수) — 같은 나쁜 자세가 10초 이상 이어졌을 때 1회로 확정합니다. 그래서 감지가 0회여도 짧은 흐트러짐 때문에 유지율은 100%가 아닐 수 있습니다.</p>
                <p>· 부위별 점수 = (1 - 그 자세였던 시간 ÷ 순공부) × 100 — 10초 이상 확정된 자세의 시간만 반영합니다. 예: 목 90점이면 공부 시간의 10%를 거북목 자세로 보냈다는 뜻입니다.</p>
                <p>· 자세 종합 점수 — 부위별 점수 3개(목·턱 괴기·어깨 균형)의 평균.</p>
                <p>· 목표 달성률 = 이번 주 순공부 시간 ÷ 주간 목표(하루 목표 × 7) × 100.</p>
                </div>
                """;
    }

    /** 초 → "1시간 40분" 표기. 전체를 분으로 반올림한 뒤 시·분으로 나눈다(59분 40초가 "0시간 60분"이 되는 것 방지). */
    private String hoursMinutes(long seconds) {
        long totalMinutes = Math.round(seconds / 60.0);
        long h = totalMinutes / 60;
        long minute = totalMinutes % 60;
        if (h == 0) {
            return minute + "분";
        }
        return minute == 0 ? h + "시간" : h + "시간 " + minute + "분";
    }
}
