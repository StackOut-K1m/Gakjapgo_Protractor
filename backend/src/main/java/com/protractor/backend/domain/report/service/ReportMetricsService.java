package com.protractor.backend.domain.report.service;

import com.protractor.backend.domain.onboarding.entity.MemberPreference;
import com.protractor.backend.domain.onboarding.repository.MemberPreferenceRepository;
import com.protractor.backend.domain.report.dto.DailyStudyResponse;
import com.protractor.backend.domain.report.dto.DailyStudyRow;
import com.protractor.backend.domain.report.dto.EventCategoryRow;
import com.protractor.backend.domain.report.dto.StudyRecordRow;
import com.protractor.backend.domain.report.dto.StudySpanRow;
import com.protractor.backend.domain.report.dto.WeeklyMetrics;
import com.protractor.backend.domain.report.dto.WeeklyMetrics.BodyPartScores;
import com.protractor.backend.domain.report.dto.WeeklyMetrics.DailyStat;
import com.protractor.backend.domain.report.dto.WeeklyMetrics.EventCounts;
import com.protractor.backend.domain.report.dto.WeeklyMetrics.Highlight;
import com.protractor.backend.domain.report.dto.WeeklyMetrics.PostureBreakdown;
import com.protractor.backend.domain.report.dto.WeeklyMetrics.WeekTrend;
import com.protractor.backend.domain.report.repository.ReportMetricsQueryRepository;
import com.protractor.backend.domain.studyrecord.entity.Event;
import java.math.BigDecimal;
import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.function.Function;
import java.util.function.ToLongFunction;
import java.util.stream.Collectors;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;

/**
 * 주간(월~일) 지표 집계.
 *
 * <p>
 * 집계 원칙 두 가지.
 * <ul>
 * <li><b>비율·점수는 순공부 시간으로 가중 평균한다.</b> 세션별 단순 평균이면 5분짜리 세션과 3시간짜리
 * 세션이 같은 무게가 되어, 잠깐 들어갔다 나온 방 하나가 주간 수치를 통째로 흔든다.</li>
 * <li><b>기록이 없으면 0이 아니라 null이다.</b> 0으로 채우면 첫 주 사용자의 "전주"가 전부 0점이 되어
 * 비교마다 가짜 개선이 만들어진다.</li>
 * </ul>
 */
@Service
@RequiredArgsConstructor
public class ReportMetricsService {

    /** 추세로 담을 주 수(이번 주 포함). 전주 하나만으로는 추세인지 우연인지 알 수 없다. */
    private static final int TREND_WEEKS = 4;

    /** 시간대 분포의 칸 수. 기록이 없는 시간대도 0으로 채워 항상 같은 길이로 내려간다. */
    private static final int HOURS_PER_DAY = 24;

    private final ReportMetricsQueryRepository queryRepository;
    private final MemberPreferenceRepository memberPreferenceRepository;

    /** 이벤트 분류 중간 집계값. */
    private record EventTally(long forwardHead, long shoulderTilt, long chinRest,
            long otherPosture, long drowsy, long away, long phoneUse, long phoneUseSeconds) {

        long badPosture() {
            return forwardHead + shoulderTilt + chinRest + otherPosture;
        }

        EventCounts toCounts() {
            return new EventCounts(badPosture(), drowsy, away, phoneUse, phoneUseSeconds);
        }
    }

    /** 월요일 시작 한 주 집계(요약 API 기본형). */
    public WeeklyMetrics collect(Long memberId, LocalDate weekStart) {
        return collect(memberId, weekStart, weekStart.plusDays(6));
    }

    /** 기간에 학습 기록이 있는지. 리포트 생성 전에 빈 기간을 걸러내는 데 쓴다(LLM 호출 낭비 방지). */
    public boolean hasStudyData(Long memberId, LocalDate startDate, LocalDate endDate) {
        return queryRepository.findRecords(memberId, startDate, endDate.plusDays(1)).stream()
                .anyMatch(r -> r.totalStudySeconds() > 0);
    }

    /** 임의 기간 집계(PDF 생성용 — 기간 자유). "전주"는 같은 길이의 직전 구간으로 잡는다. */
    public WeeklyMetrics collect(Long memberId, LocalDate startDate, LocalDate endDate) {
        long periodDays = ChronoUnit.DAYS.between(startDate, endDate) + 1;
        LocalDateTime curFrom = startDate.atStartOfDay();
        LocalDateTime curTo = endDate.plusDays(1).atStartOfDay();
        LocalDateTime prevFrom = curFrom.minusDays(periodDays);

        // 학습 기록은 학습일(DATE)로, 감지 이벤트는 발생 시각(DATETIME)으로 자른다. 기준이 다른 것이 아니라
        // 이벤트에는 학습일 개념이 없어 실제 발생 시각을 그대로 쓰는 것이다.
        LocalDate curToDate = endDate.plusDays(1);
        LocalDate prevFromDate = startDate.minusDays(periodDays);

        List<StudyRecordRow> cur = queryRepository.findRecords(memberId, startDate, curToDate);
        List<StudyRecordRow> prev = queryRepository.findRecords(memberId, prevFromDate, startDate);
        EventTally curEvents = tally(queryRepository.countEventsByCategory(memberId, curFrom, curTo));
        EventTally prevEvents = tally(queryRepository.countEventsByCategory(memberId, prevFrom, curFrom));

        long focusedSeconds = sum(cur, StudyRecordRow::focusedSeconds);
        Integer goalMinutes = memberPreferenceRepository.findById(memberId)
                .map(MemberPreference::getGoalMinutes)
                .filter(minutes -> minutes > 0)
                .orElse(null);
        Integer weeklyGoalMinutes = goalMinutes == null ? null : goalMinutes * 7;
        // 달성률은 주 단위(7일) 기간에만 계산한다. 3일짜리 커스텀 기간을 주간 목표로 나누면
        // "많이 부족하다"는 불공정한 평가가 리포트에 실린다(실소견 검수에서 확인).
        Integer goalAchievementRate = weeklyGoalMinutes == null || periodDays != 7 ? null
                : (int) Math.round(focusedSeconds / 60.0 / weeklyGoalMinutes * 100);

        return new WeeklyMetrics(
                startDate, endDate,
                sum(cur, StudyRecordRow::totalStudySeconds),
                focusedSeconds,
                sum(cur, StudyRecordRow::breakSeconds),
                sum(cur, StudyRecordRow::awaySeconds),
                weightedRatio(cur, StudyRecordRow::goodPostureRatio),
                weightedRatio(prev, StudyRecordRow::goodPostureRatio),
                weightedRatio(cur, StudyRecordRow::totalScore),
                weightedRatio(prev, StudyRecordRow::totalScore),
                weightedRatio(cur, StudyRecordRow::focusScore),
                goalMinutes,
                weeklyGoalMinutes,
                goalAchievementRate,
                bodyPartScores(cur),
                bodyPartScores(prev),
                curEvents.toCounts(),
                prevEvents.toCounts(),
                breakdown(curEvents),
                breakdown(prevEvents),
                (int) sum(cur, StudyRecordRow::warningCount),
                (int) sum(prev, StudyRecordRow::warningCount),
                (int) sum(cur, StudyRecordRow::stretchingAttemptCount),
                (int) sum(cur, StudyRecordRow::stretchingCompletedCount),
                dailyStats(cur, startDate, endDate),
                hourlyFocusMinutes(queryRepository.findStudySpans(memberId, startDate, curToDate)),
                weeklyTrend(memberId, startDate),
                worstPosture(memberId, curFrom, curTo));
    }

    /**
     * 임의 기간의 하루 단위 학습 요약. 학습 캘린더가 한 달치를 한 번에 받아 각 칸을 채운다.
     *
     * <p>
     * 기록이 없는 날은 항목을 만들지 않는다 — 달력은 42칸 중 대부분이 빈 날이라, 0으로 채워
     * 보내면 응답의 대부분이 의미 없는 0이 되고 화면도 "0시간 공부"와 구분할 수 없게 된다.
     */
    public List<DailyStudyResponse> collectDaily(Long memberId, LocalDate fromDate, LocalDate toDate) {
        Map<LocalDate, List<DailyStudyRow>> byDate = queryRepository
                .findDailyStudy(memberId, fromDate, toDate).stream()
                .filter(r -> r.studyDate() != null)
                .collect(Collectors.groupingBy(DailyStudyRow::studyDate));

        return byDate.entrySet().stream()
                .sorted(Map.Entry.comparingByKey())
                .map(entry -> {
                    List<DailyStudyRow> rows = entry.getValue();
                    // 방 이름은 중복을 접고 순서를 유지한다(같은 방을 드나들면 행이 여러 개 생긴다).
                    List<String> titles = rows.stream()
                            .map(DailyStudyRow::roomTitle)
                            .filter(Objects::nonNull)
                            .distinct()
                            .toList();
                    return new DailyStudyResponse(
                            entry.getKey(),
                            rows.stream().mapToLong(DailyStudyRow::totalStudySeconds).sum(),
                            rows.stream().mapToLong(DailyStudyRow::focusedSeconds).sum(),
                            weightedDailyRatio(rows),
                            titles);
                })
                .toList();
    }

    /**
     * 하루 안 여러 방 기록의 유지율을 순공부로 가중 평균한다.
     * {@link #weightedRatio}와 같은 규칙인데 행 타입이 달라 따로 뒀다.
     */
    private Integer weightedDailyRatio(List<DailyStudyRow> rows) {
        long weight = 0;
        double acc = 0;
        for (DailyStudyRow row : rows) {
            if (row.goodPostureRatio() == null || row.focusedSeconds() <= 0) {
                continue;
            }
            weight += row.focusedSeconds();
            acc += row.goodPostureRatio().doubleValue() * row.focusedSeconds();
        }
        return weight == 0 ? null : (int) Math.round(acc / weight);
    }

    private BodyPartScores bodyPartScores(List<StudyRecordRow> rows) {
        return new BodyPartScores(
                weightedRatio(rows, StudyRecordRow::neckScore),
                weightedRatio(rows, StudyRecordRow::chinRestScore),
                weightedRatio(rows, StudyRecordRow::shoulderTiltScore));
    }

    private PostureBreakdown breakdown(EventTally t) {
        return new PostureBreakdown(t.forwardHead(), t.shoulderTilt(), t.chinRest(),
                t.otherPosture(), t.drowsy(), t.phoneUse(), t.badPosture() + t.drowsy() + t.phoneUse());
    }

    private List<DailyStat> dailyStats(List<StudyRecordRow> rows, LocalDate weekStart, LocalDate weekEnd) {
        Map<LocalDate, List<StudyRecordRow>> byDate = rows.stream()
                .filter(r -> r.studyDate() != null)
                .collect(Collectors.groupingBy(StudyRecordRow::studyDate));

        List<DailyStat> daily = new ArrayList<>();
        for (LocalDate date = weekStart; !date.isAfter(weekEnd); date = date.plusDays(1)) {
            List<StudyRecordRow> dayRows = byDate.getOrDefault(date, List.of());
            daily.add(new DailyStat(
                    date,
                    sum(dayRows, StudyRecordRow::totalStudySeconds),
                    sum(dayRows, StudyRecordRow::focusedSeconds),
                    weightedRatio(dayRows, StudyRecordRow::goodPostureRatio)));
        }
        return daily;
    }

    /**
     * 시간대별 순공부 분(0~23시, 24칸).
     *
     * <p>
     * 기록에는 방에 있던 구간(joined_at~left_at)과 그 중 순공부 시간만 남는다 — 쉬는 시간이 구간
     * 안 어디에 있었는지는 모른다. 그래서 순공부 시간을 구간 전체에 고르게 펼쳐 시간대에 나눠 담는다.
     * 예를 들어 21:30~23:30 동안 순공부 60분이면 21시대 15분, 22시대 30분, 23시대 15분이 된다.
     *
     * <p>
     * 자정을 넘긴 학습도 문제없다. 서버가 날짜가 바뀌는 순간 행을 나눠 저장하므로 한 행이 하루를
     * 넘지 않고, 넘더라도 아래 반복문이 시간 단위로 잘라 담는다.
     */
    private List<Integer> hourlyFocusMinutes(List<StudySpanRow> spans) {
        double[] seconds = new double[HOURS_PER_DAY];
        for (StudySpanRow span : spans) {
            long spanSeconds = ChronoUnit.SECONDS.between(span.joinedAt(), span.leftAt());
            if (spanSeconds <= 0) {
                // 들어오자마자 나간(또는 시각이 뒤집힌) 행. 펼칠 구간이 없어 시작 시각에 통째로 넣는다.
                seconds[span.joinedAt().getHour()] += span.focusedSeconds();
                continue;
            }
            // 구간을 시(hour) 경계로 잘라 가며, 잘린 길이에 비례해 순공부 시간을 나눠 담는다.
            double focusPerSecond = span.focusedSeconds() / (double) spanSeconds;
            LocalDateTime cursor = span.joinedAt();
            while (cursor.isBefore(span.leftAt())) {
                LocalDateTime nextHour = cursor.truncatedTo(ChronoUnit.HOURS).plusHours(1);
                LocalDateTime sliceEnd = nextHour.isAfter(span.leftAt()) ? span.leftAt() : nextHour;
                seconds[cursor.getHour()] += ChronoUnit.SECONDS.between(cursor, sliceEnd) * focusPerSecond;
                cursor = sliceEnd;
            }
        }

        List<Integer> minutes = new ArrayList<>(HOURS_PER_DAY);
        for (double s : seconds) {
            minutes.add((int) Math.round(s / 60));
        }
        return minutes;
    }

    /**
     * 이번 주 포함 최근 {@value TREND_WEEKS}주의 순공부 시간·유지율. 주 경계는 조회 시작일의 월요일 기준이다
     * (임의 기간 PDF도 달력 주 단위 추세를 보여주는 것이 읽기 쉽다).
     */
    private List<WeekTrend> weeklyTrend(Long memberId, LocalDate startDate) {
        LocalDate thisMonday = startDate.with(DayOfWeek.MONDAY);
        LocalDate trendStart = thisMonday.minusWeeks(TREND_WEEKS - 1);
        List<StudyRecordRow> rows = queryRepository.findRecords(memberId, trendStart, thisMonday.plusDays(7));

        Map<LocalDate, List<StudyRecordRow>> byWeek = rows.stream()
                .filter(r -> r.studyDate() != null)
                .collect(Collectors.groupingBy(r -> r.studyDate().with(DayOfWeek.MONDAY)));

        List<WeekTrend> trend = new ArrayList<>();
        for (int i = 0; i < TREND_WEEKS; i++) {
            LocalDate monday = trendStart.plusWeeks(i);
            List<StudyRecordRow> weekRows = byWeek.getOrDefault(monday, List.of());
            trend.add(new WeekTrend(monday,
                    sum(weekRows, StudyRecordRow::focusedSeconds),
                    weightedRatio(weekRows, StudyRecordRow::goodPostureRatio)));
        }
        return trend;
    }

    /**
     * 이벤트 (종류, 세부, 부위) 카운트를 화면 분류로 접는다.
     * 자세가 아닌 종류(졸음·자리비움·휴대폰)는 event_type만 보고 먼저 걸러낸다.
     * 세부(detail)가 있으면 그대로 쓰고, 없으면 부위가 NECK일 때만 거북목으로 간주한다.
     * 판정하지 않는 종류(옛 ROUNDED_SHOULDER 기록 등)와 detail이 빈 어깨 이벤트는 otherPosture로 접힌다.
     */
    private EventTally tally(List<EventCategoryRow> rows) {
        long forwardHead = 0;
        long shoulderTilt = 0;
        long chinRest = 0;
        long otherPosture = 0;
        long drowsy = 0;
        long away = 0;
        long phoneUse = 0;
        long phoneUseSeconds = 0;

        for (EventCategoryRow row : rows) {
            if ("AWAY".equals(row.eventType()) || "AWAY".equals(row.detail())) {
                away += row.count();
                continue;
            }
            if ("DROWSY".equals(row.eventType())) {
                drowsy += row.count();
                continue;
            }
            if ("PHONE".equals(row.eventType())) {
                phoneUse += row.count();
                phoneUseSeconds += row.totalSeconds();
                continue;
            }
            if (!"POSTURE".equals(row.eventType())) {
                continue;
            }
            switch (category(row.detail(), row.bodyPart())) {
                case "FORWARD_HEAD" -> forwardHead += row.count();
                case "SHOULDER_TILT" -> shoulderTilt += row.count();
                case "CHIN_REST" -> chinRest += row.count();
                default -> otherPosture += row.count();
            }
        }
        return new EventTally(forwardHead, shoulderTilt, chinRest, otherPosture, drowsy, away,
                phoneUse, phoneUseSeconds);
    }

    private String category(String detail, String bodyPart) {
        if (detail != null) {
            return detail;
        }
        return "NECK".equals(bodyPart) ? "FORWARD_HEAD" : "OTHER";
    }

    private Highlight worstPosture(Long memberId, LocalDateTime fromAt, LocalDateTime toAt) {
        return queryRepository.findWorstPostureEvents(memberId, fromAt, toAt, PageRequest.of(0, 1)).stream()
                .findFirst()
                .map(e -> new Highlight(e.getStartedAt(), e.getCaptureUrl(), e.getBodyPart(), e.getDetail(),
                        e.getDeviationDegrees(), e.getDurationSeconds(), e.getSeverity(), describe(e)))
                .orElse(null);
    }

    /** 하이라이트 설명 문구. 수치는 이벤트에 남은 값만 사용한다(임의 생성 금지). */
    private String describe(Event e) {
        String posture = switch (category(e.getDetail(), e.getBodyPart())) {
            case "FORWARD_HEAD" -> e.getDeviationDegrees() != null
                    ? "목 각도가 앞으로 %.0f도 꺾인 거북목 자세".formatted(e.getDeviationDegrees())
                    : "목이 앞으로 꺾인 거북목 자세";
            case "CHIN_REST" -> "손으로 턱을 괸 자세";
            case "SHOULDER_TILT" -> e.getDeviationDegrees() != null
                    ? "좌우 어깨가 %.0f도 기울어진 자세".formatted(e.getDeviationDegrees())
                    : "좌우 어깨 높이가 틀어진 자세";
            default -> "바르지 않은 자세";
        };
        if (e.getDurationSeconds() != null && e.getDurationSeconds() > 0) {
            int seconds = e.getDurationSeconds();
            String duration = seconds >= 60 ? (seconds / 60) + "분 " + (seconds % 60) + "초" : seconds + "초";
            return posture + "가 " + duration + "간 지속되었습니다.";
        }
        return posture + "가 감지되었습니다.";
    }

    private long sum(List<StudyRecordRow> rows, ToLongFunction<StudyRecordRow> getter) {
        return rows.stream().mapToLong(getter).sum();
    }

    /**
     * 비율·점수의 순공부 시간 가중 평균. 값이 null(종료 전)이거나 순공부가 0인 세션은 분모·분자
     * 모두에서 뺀다 — 순공부 0인 세션의 점수·유지율은 서버가 넣은 기본값이라 정보가 없다.
     * 가중할 세션이 하나도 없으면 null이다(기록 없음 — 0점과 구분).
     */
    private Integer weightedRatio(List<StudyRecordRow> rows, Function<StudyRecordRow, BigDecimal> getter) {
        long weight = 0;
        double acc = 0;
        for (StudyRecordRow row : rows) {
            BigDecimal value = getter.apply(row);
            if (value == null || row.focusedSeconds() <= 0) {
                continue;
            }
            weight += row.focusedSeconds();
            acc += value.doubleValue() * row.focusedSeconds();
        }
        if (weight == 0) {
            return null;
        }
        return (int) Math.round(acc / weight);
    }
}
