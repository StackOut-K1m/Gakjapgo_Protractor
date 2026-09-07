package com.protractor.backend.domain.report.dto;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;

/**
 * 한 주(월~일)의 집계 결과. summary API 응답, LLM 프롬프트, 차트, PDF가 모두 이 값을 쓰고,
 * 리포트 생성 시 JSON으로 직렬화해 reports.input_data에 남긴다(소견 수치의 근거 보존).
 *
 * <p>
 * 점수·비율은 반올림한 정수(0~100)로 다루되, <b>기록이 없으면 0이 아니라 null</b>이다.
 * 0으로 두면 "전주 0점 → 이번 주 87점"처럼 있지도 않은 대폭 개선이 만들어진다 — 첫 주 사용자의
 * 리포트마다 가짜 성장 서사가 실리던 원인이라 null로 구분한다(FE·프롬프트는 null을 "기록 없음"으로 다룬다).
 */
public record WeeklyMetrics(
        LocalDate weekStart,
        LocalDate weekEnd,
        long totalStudySeconds,
        long focusedSeconds,
        long breakSeconds,
        long awaySeconds,
        Integer goodPostureRatio,
        Integer prevGoodPostureRatio,
        Integer totalScore,
        Integer prevTotalScore,
        Integer focusScore,
        // 온보딩의 하루 목표(분). 미설정이면 셋 다 null이다.
        Integer goalMinutes,
        Integer weeklyGoalMinutes,
        // 주간 목표 대비 순공부 시간 비율(%). 100을 넘을 수 있다(초과 달성).
        Integer goalAchievementRate,
        BodyPartScores bodyPartScores,
        BodyPartScores prevBodyPartScores,
        EventCounts eventCounts,
        EventCounts prevEventCounts,
        PostureBreakdown postureBreakdown,
        PostureBreakdown prevPostureBreakdown,
        int warningCount,
        int prevWarningCount,
        int stretchingAttemptCount,
        int stretchingCompletedCount,
        List<DailyStat> dailyStats,
        /**
         * 시간대별 순공부 분(0시~23시, 항상 24칸). 기록이 없는 시간대는 0이다.
         *
         * <p>
         * study_records에는 "몇 시에 공부했는지"가 없고 방에 있던 구간(joined_at~left_at)만 있다.
         * 그래서 순공부 시간을 그 구간에 고르게 펼쳐 시간대에 나눠 담는다 — 쉬는 시간이 구간
         * 안 어디에 있었는지는 알 수 없으니, 분포는 정확한 값이 아니라 근사다.
         */
        List<Integer> hourlyFocusMinutes,
        // 이번 주 포함 최근 4주. 1주짜리 전주 비교만으로는 추세인지 우연인지 알 수 없어 함께 담는다.
        List<WeekTrend> weeklyTrend,
        Highlight worstPosture) {

    /**
     * 항목별 자세 점수. 기록이 없는 주는 null이다(0점과 구분).
     * DB 컬럼도 같은 이름이다(neck_score / chin_rest_score / shoulder_tilt_score).
     */
    public record BodyPartScores(Integer neck, Integer chinRest, Integer shoulderTilt) {
    }

    /**
     * 감지 이벤트 총계. away는 현재 이벤트로 저장되지 않아 0이 정상(기록은 away_seconds로만 남는다).
     *
     * <p>
     * phoneUse는 자세가 아니라 집중을 깨는 행동이라 badPosture에 합치지 않고 따로 센다.
     *
     * @param phoneUseSeconds 휴대폰을 보고 있던 시간 합(초). 횟수만으로는 "10초 확인"과 "20분 시청"이
     *     같아 보여서 함께 넘긴다. 졸음은 구간 길이를 저장하지 않아 같은 값을 낼 수 없다.
     */
    public record EventCounts(long badPosture, long drowsy, long away, long phoneUse, long phoneUseSeconds) {
    }

    /**
     * 상세 페이지 도넛 차트용 분류. otherPosture는 세부 종류를 알 수 없는 자세 이벤트다.
     *
     * <p>
     * 이름은 자세지만 도넛은 "집중을 깬 것들"을 보여주는 자리라 졸음·휴대폰도 함께 담는다. total도 그 합이다.
     */
    public record PostureBreakdown(long forwardHead, long shoulderTilt, long chinRest,
            long otherPosture, long drowsy, long phoneUse, long total) {
    }

    /** 일별 통계. 기록이 없는 날은 시간 0, 유지율 null이다. */
    public record DailyStat(LocalDate date, long totalStudySeconds, long focusedSeconds, Integer goodPostureRatio) {
    }

    /** 주 하나의 추세 값. 유지율은 그 주에 측정이 없으면 null이다. */
    public record WeekTrend(LocalDate weekStart, long focusedSeconds, Integer goodPostureRatio) {
    }

    /**
     * 자세 하이라이트 한 건. captureUrl은 이벤트 캡처 저장이 아직 구현되지 않아 현재는 null이다
     * (자세감지 파트가 캡처 업로드를 붙이면 자동으로 채워진다 — 팀 협의 항목).
     */
    public record Highlight(LocalDateTime capturedAt, String captureUrl, String bodyPart, String detail,
            BigDecimal deviationDegrees, Integer durationSeconds, Integer severity, String description) {
    }
}
