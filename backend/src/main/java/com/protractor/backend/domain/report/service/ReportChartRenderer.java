package com.protractor.backend.domain.report.service;

import com.protractor.backend.domain.report.dto.WeeklyMetrics;
import java.awt.BasicStroke;
import java.awt.Color;
import java.awt.Font;
import java.awt.FontFormatException;
import java.awt.Paint;
import java.awt.geom.Ellipse2D;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.IOException;
import java.time.format.DateTimeFormatter;
import java.util.List;
import org.jfree.chart.ChartUtils;
import org.jfree.chart.JFreeChart;
import org.jfree.chart.axis.CategoryAxis;
import org.jfree.chart.axis.NumberAxis;
import org.jfree.chart.block.BlockBorder;
import org.jfree.chart.labels.StandardCategoryItemLabelGenerator;
import org.jfree.chart.plot.CategoryPlot;
import org.jfree.chart.plot.DatasetRenderingOrder;
import org.jfree.chart.renderer.category.BarRenderer;
import org.jfree.chart.renderer.category.LineAndShapeRenderer;
import org.jfree.chart.renderer.category.StandardBarPainter;
import org.jfree.chart.title.TextTitle;
import org.jfree.chart.ui.HorizontalAlignment;
import org.jfree.chart.ui.RectangleEdge;
import org.jfree.chart.ui.RectangleInsets;
import org.jfree.data.category.CategoryDataset;
import org.jfree.data.category.DefaultCategoryDataset;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/**
 * PDF에 넣을 주간 지표 차트 4종을 PNG로 그린다. 웹 상세 페이지의 차트는 FE(recharts)가 그리므로 여기는 PDF 전용이다.
 *
 * <p>
 * 스타일 규칙:
 * <ul>
 * <li>색은 FE 디자인 토큰(frontend/src/styles/variables.css)과 맞춘다 — 화면과 PDF의 등급색이 다르면 안 된다.
 * 등급 경계(85/70)도 FE reportGrade.ts와 같은 값이다.</li>
 * <li>기본 JFreeChart 장식(플롯 테두리·축선·틱마크·범례 테두리)은 전부 걷어낸다. 남기는 것은 연한 가로 그리드뿐.</li>
 * <li>폭은 1350으로 통일하고 폰트를 1.5배로 키운다 — PDF에서 지면 폭에 맞춰 축소되므로 같은 크기로 더 선명하게 찍힌다.</li>
 * <li>전주는 연회색, 이번 주는 의미색(점수=등급색, 이벤트=빨강, 시간=브랜드 초록).</li>
 * </ul>
 */
@Component
public class ReportChartRenderer {

    // FE 토큰과 동일한 값 (variables.css)
    private static final Color PRIMARY = new Color(0x2d8c3c);      // --gak-primary — 문서 안 "좋음/기본" 초록은 이 한 톤만
    private static final Color WARNING = new Color(0xf59e0b);      // --gak-status-warning
    private static final Color DANGER = new Color(0xf04438);       // --gak-status-danger
    private static final Color PREV_GRAY = new Color(0xD0D5DD);    // --gak-border — 전주 막대(배경 역할이라 연하게)
    private static final Color TEXT = new Color(0x101828);         // --gak-text
    private static final Color TEXT_SECONDARY = new Color(0x475467);
    private static final Color TEXT_MUTED = new Color(0x98a2b3);
    private static final Color GRIDLINE = new Color(0xE4E7EC);

    private static final DateTimeFormatter DAY_LABEL = DateTimeFormatter.ofPattern("MM/dd");

    private final String fontPath;

    public ReportChartRenderer(@Value("${app.report.font-path}") String fontPath) {
        this.fontPath = fontPath;
    }

    /** 차트 4장(일별 콤보, 4주 추세, 부위별 점수, 감지 이벤트)을 순서대로 반환한다. 순서는 프롬프트의 그래프 번호와 같다. */
    public List<byte[]> render(WeeklyMetrics m) throws IOException, FontFormatException {
        Font font = loadFont();
        return List.of(dailyChart(m, font), trendChart(m, font), bodyPartChart(m, font), eventChart(m, font));
    }

    /** 기본 AWT 폰트는 한글이 □로 깨져서 반드시 TTF를 직접 싣는다. */
    private Font loadFont() throws IOException, FontFormatException {
        File file = new File(fontPath);
        if (!file.exists()) {
            throw new IllegalStateException("한글 폰트 파일이 없습니다: " + fontPath + " (REPORT_FONT_PATH 환경변수로 지정)");
        }
        return Font.createFont(Font.TRUETYPE_FONT, file);
    }

    /** 차트 1: 일별 공부 시간(막대) + 자세 유지율(선, 보조축). 기록이 이어진 날만 선이 연결된다. */
    private byte[] dailyChart(WeeklyMetrics m, Font font) throws IOException {
        DefaultCategoryDataset bars = new DefaultCategoryDataset();
        DefaultCategoryDataset line = new DefaultCategoryDataset();
        for (WeeklyMetrics.DailyStat d : m.dailyStats()) {
            String day = DAY_LABEL.format(d.date());
            bars.addValue(Math.round(d.totalStudySeconds() / 60.0), "공부 시간(분)", day);
            line.addValue(d.goodPostureRatio(), "자세 유지율(%)", day);
        }
        // 높이는 "차트 2장 + 판독 2줄"이 A4 한 페이지에 들어가는 예산으로 잡았다(넘치면 차트가
        // 통째로 다음 장에 밀려 페이지 하단이 크게 빈다 — 실데이터에서 실제로 발생).
        return toPng(comboChart("일별 학습 시간 · 자세 유지율", "공부 시간(분)", bars, line, font), 1350, 510);
    }

    /** 차트 2: 최근 4주 순공부 시간(막대) + 유지율(선). 이번 주가 흐름의 어디쯤인지 보여준다. */
    private byte[] trendChart(WeeklyMetrics m, Font font) throws IOException {
        DefaultCategoryDataset bars = new DefaultCategoryDataset();
        DefaultCategoryDataset line = new DefaultCategoryDataset();
        for (WeeklyMetrics.WeekTrend w : m.weeklyTrend()) {
            String week = DAY_LABEL.format(w.weekStart()) + "주";
            bars.addValue(Math.round(w.focusedSeconds() / 360.0) / 10.0, "순공부 시간(시간)", week);
            line.addValue(w.goodPostureRatio(), "자세 유지율(%)", week);
        }
        return toPng(comboChart("최근 4주 흐름", "순공부 시간(시간)", bars, line, font), 1350, 470);
    }

    /** 차트 3: 항목별 점수 — 전주(연회색) vs 이번 주(등급색). 기록 없는 값(null)은 막대가 비어 보인다. */
    private byte[] bodyPartChart(WeeklyMetrics m, Font font) throws IOException {
        DefaultCategoryDataset dataset = new DefaultCategoryDataset();
        dataset.addValue(m.prevBodyPartScores().neck(), "전주", "목");
        dataset.addValue(m.prevBodyPartScores().chinRest(), "전주", "턱 괴기");
        dataset.addValue(m.prevBodyPartScores().shoulderTilt(), "전주", "어깨 균형");
        dataset.addValue(m.bodyPartScores().neck(), "이번 주", "목");
        dataset.addValue(m.bodyPartScores().chinRest(), "이번 주", "턱 괴기");
        dataset.addValue(m.bodyPartScores().shoulderTilt(), "이번 주", "어깨 균형");

        BarRenderer renderer = new BarRenderer() {
            @Override
            public Paint getItemPaint(int row, int column) {
                if (row == 0) {
                    return PREV_GRAY;
                }
                Number value = dataset.getValue(1, column);
                if (value == null) {
                    return PREV_GRAY;
                }
                double score = value.doubleValue();
                // 경계는 FE reportGrade.ts와 동일(85/70). 우수 색만 브랜드 초록으로 통일(네온 ok색은 PDF에서 튄다)
                return score >= 85 ? PRIMARY : score >= 70 ? WARNING : DANGER;
            }
        };
        styleBars(renderer, font);
        renderer.setSeriesPaint(0, PREV_GRAY);
        renderer.setSeriesPaint(1, PRIMARY); // 범례 견본색

        NumberAxis axis = new NumberAxis();
        axis.setRange(0, 105);
        CategoryPlot plot = new CategoryPlot(dataset, new CategoryAxis(), axis, renderer);
        return toPng(buildChart("부위별 자세 점수", plot, font), 1350, 510);
    }

    /** 차트 4: 집중을 깬 순간들 — 전주(연회색) vs 이번 주(빨강), 종류별. */
    private byte[] eventChart(WeeklyMetrics m, Font font) throws IOException {
        DefaultCategoryDataset dataset = new DefaultCategoryDataset();
        WeeklyMetrics.PostureBreakdown prev = m.prevPostureBreakdown();
        WeeklyMetrics.PostureBreakdown cur = m.postureBreakdown();
        dataset.addValue(prev.forwardHead(), "전주", "거북목");
        dataset.addValue(prev.chinRest(), "전주", "턱 괴기");
        dataset.addValue(prev.shoulderTilt(), "전주", "어깨 균형");
        dataset.addValue(prev.drowsy(), "전주", "졸음");
        dataset.addValue(prev.phoneUse(), "전주", "휴대폰");
        dataset.addValue(cur.forwardHead(), "이번 주", "거북목");
        dataset.addValue(cur.chinRest(), "이번 주", "턱 괴기");
        dataset.addValue(cur.shoulderTilt(), "이번 주", "어깨 균형");
        dataset.addValue(cur.drowsy(), "이번 주", "졸음");
        dataset.addValue(cur.phoneUse(), "이번 주", "휴대폰");

        BarRenderer renderer = new BarRenderer();
        styleBars(renderer, font);
        renderer.setSeriesPaint(0, PREV_GRAY);
        renderer.setSeriesPaint(1, DANGER);

        // 횟수 축은 자동 범위에 맡기지 않는다 — 전부 0인 주에 ±5E-9 같은 과학 표기 눈금이 나오고,
        // 자동 확장은 0 아래(음수 횟수) 구간까지 그린다. 0부터 시작해 최소 5칸을 보장하고 정수 눈금만 쓴다.
        long max = 0;
        for (int r = 0; r < dataset.getRowCount(); r++) {
            for (int c = 0; c < dataset.getColumnCount(); c++) {
                Number v = dataset.getValue(r, c);
                if (v != null) {
                    max = Math.max(max, v.longValue());
                }
            }
        }
        NumberAxis axis = new NumberAxis();
        axis.setStandardTickUnits(NumberAxis.createIntegerTickUnits());
        axis.setRange(0, Math.max(5, Math.ceil(max * 1.15)));
        CategoryPlot plot = new CategoryPlot(dataset, new CategoryAxis(), axis, renderer);
        return toPng(buildChart("집중을 깬 순간들 (횟수)", plot, font), 1350, 510);
    }

    /** 막대+선(보조축 0~100%) 콤보 차트. 일별·주별 추세가 같은 문법을 쓰게 한다. */
    private JFreeChart comboChart(String title, String barAxisLabel,
            DefaultCategoryDataset bars, DefaultCategoryDataset line, Font font) {
        BarRenderer barRenderer = new BarRenderer();
        styleBars(barRenderer, font);
        barRenderer.setSeriesPaint(0, PRIMARY);
        CategoryPlot plot = new CategoryPlot(bars, new CategoryAxis(), new NumberAxis(barAxisLabel), barRenderer);

        NumberAxis ratioAxis = new NumberAxis("자세 유지율(%)");
        ratioAxis.setRange(0, 100);
        LineAndShapeRenderer lineRenderer = new LineAndShapeRenderer(true, true);
        lineRenderer.setSeriesPaint(0, WARNING);
        lineRenderer.setSeriesStroke(0, new BasicStroke(3.5f, BasicStroke.CAP_ROUND, BasicStroke.JOIN_ROUND));
        // 도트는 흰 속 + 주황 테두리 — 선 위에서 값 위치가 또렷하게 보인다.
        lineRenderer.setSeriesShape(0, new Ellipse2D.Double(-5.5, -5.5, 11, 11));
        lineRenderer.setUseFillPaint(true);
        lineRenderer.setSeriesFillPaint(0, Color.WHITE);
        lineRenderer.setUseOutlinePaint(true);
        lineRenderer.setSeriesOutlinePaint(0, WARNING);
        lineRenderer.setSeriesOutlineStroke(0, new BasicStroke(3f));
        lineRenderer.setDrawOutlines(true);
        plot.setDataset(1, line);
        plot.setRenderer(1, lineRenderer);
        plot.setRangeAxis(1, ratioAxis);
        plot.mapDatasetToRangeAxis(1, 1);
        // 선(dataset 1)이 막대 위에 그려지게 한다.
        plot.setDatasetRenderingOrder(DatasetRenderingOrder.FORWARD);
        return buildChart(title, plot, font);
    }

    /** 막대 공통 스타일 — 그라데이션·그림자 없는 단색, 얇은 폭, 막대 위 회색 값 라벨. */
    private void styleBars(BarRenderer renderer, Font font) {
        renderer.setBarPainter(new StandardBarPainter());
        renderer.setShadowVisible(false);
        renderer.setMaximumBarWidth(0.09);
        renderer.setItemMargin(0.06);
        // 값이 0이거나 없는 자리는 라벨을 찍지 않는다 — 빈 날짜마다 "0"이 떠 있으면 지저분하다.
        renderer.setDefaultItemLabelGenerator(new StandardCategoryItemLabelGenerator() {
            @Override
            public String generateLabel(CategoryDataset dataset, int row, int column) {
                Number value = dataset.getValue(row, column);
                if (value == null || value.doubleValue() == 0) {
                    return null;
                }
                return super.generateLabel(dataset, row, column);
            }
        });
        renderer.setDefaultItemLabelsVisible(true);
        renderer.setDefaultItemLabelFont(font.deriveFont(15f));
        renderer.setDefaultItemLabelPaint(TEXT_SECONDARY);
    }

    /** 차트 공통 마감 — 기본 장식 제거(테두리·축선·틱마크·범례 프레임), 왼쪽 정렬 제목, 연한 가로 그리드만 남긴다. */
    private JFreeChart buildChart(String title, CategoryPlot plot, Font font) {
        plot.setBackgroundPaint(Color.WHITE);
        plot.setOutlineVisible(false);
        plot.setDomainGridlinesVisible(false);
        plot.setRangeGridlinePaint(GRIDLINE);
        plot.setRangeGridlineStroke(new BasicStroke(1f));
        plot.setAxisOffset(new RectangleInsets(4, 4, 4, 4));

        Font axisFont = font.deriveFont(16f);
        Font tickFont = font.deriveFont(15f);
        CategoryAxis domain = plot.getDomainAxis();
        domain.setLabelFont(axisFont);
        domain.setTickLabelFont(tickFont);
        domain.setTickLabelPaint(TEXT_SECONDARY);
        domain.setAxisLineVisible(false);
        domain.setTickMarksVisible(false);
        for (int i = 0; i < plot.getRangeAxisCount(); i++) {
            if (plot.getRangeAxis(i) != null) {
                plot.getRangeAxis(i).setLabelFont(axisFont);
                plot.getRangeAxis(i).setLabelPaint(TEXT_MUTED);
                plot.getRangeAxis(i).setTickLabelFont(tickFont);
                plot.getRangeAxis(i).setTickLabelPaint(TEXT_MUTED);
                plot.getRangeAxis(i).setAxisLineVisible(false);
                plot.getRangeAxis(i).setTickMarksVisible(false);
            }
        }

        JFreeChart chart = new JFreeChart(null, null, plot, true);
        chart.setAntiAlias(true);
        chart.setTextAntiAlias(true);
        chart.setBackgroundPaint(Color.WHITE);

        TextTitle textTitle = new TextTitle(title, font.deriveFont(Font.BOLD, 22f));
        textTitle.setPaint(TEXT);
        textTitle.setHorizontalAlignment(HorizontalAlignment.LEFT);
        textTitle.setPadding(new RectangleInsets(2, 6, 10, 0));
        chart.setTitle(textTitle);

        if (chart.getLegend() != null) {
            chart.getLegend().setItemFont(font.deriveFont(16f));
            chart.getLegend().setItemPaint(TEXT_SECONDARY);
            chart.getLegend().setFrame(BlockBorder.NONE);
            chart.getLegend().setPosition(RectangleEdge.BOTTOM);
        }
        return chart;
    }

    private byte[] toPng(JFreeChart chart, int width, int height) throws IOException {
        BufferedImage image = chart.createBufferedImage(width, height);
        try (ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            ChartUtils.writeBufferedImageAsPNG(out, image);
            return out.toByteArray();
        }
    }
}
