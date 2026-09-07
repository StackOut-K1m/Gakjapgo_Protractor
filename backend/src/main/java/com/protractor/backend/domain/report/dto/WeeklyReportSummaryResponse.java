package com.protractor.backend.domain.report.dto;

import com.protractor.backend.domain.report.dto.WeeklyMetrics.BodyPartScores;
import com.protractor.backend.domain.report.dto.WeeklyMetrics.DailyStat;
import com.protractor.backend.domain.report.dto.WeeklyMetrics.EventCounts;
import com.protractor.backend.domain.report.dto.WeeklyMetrics.Highlight;
import com.protractor.backend.domain.report.dto.WeeklyMetrics.PostureBreakdown;
import com.protractor.backend.domain.report.dto.WeeklyMetrics.WeekTrend;
import java.time.LocalDate;
import java.util.List;

/**
 * GET /reports/me/summary 응답. 마이페이지 리포트 카드와 주간 리포트 상세 페이지가 함께 쓴다.
 *
 * <p>
 * 점수·비율은 <b>기록이 없으면 0이 아니라 null</b>이다 — FE는 null을 "-"나 "첫 기록 주"로 표시하고
 * 전주 비교 배지를 만들지 않는다(2026-08-04 리모델링, 0으로 내리던 때는 첫 주마다 가짜 개선 배지가 생겼다).
 *
 * <p>
 * 명세 v4(104행) 대비 확장: postureBreakdown(도넛), prevWeek(전주 대비 배지), highlights(자세 캡처),
 * aiFeedback(생성된 리포트의 LLM 소견 원문 — 없으면 null, summaryText는 항상 오는 규칙 기반 한 줄),
 * 학습 목표(goalMinutes·weeklyGoalMinutes·goalAchievementRate — 미설정이면 null), weeklyTrend(최근 4주).
 */
public record WeeklyReportSummaryResponse(
        String period,
        LocalDate weekStart,
        LocalDate weekEnd,
        List<DailyStat> dailyStats,
        /** 시간대별 순공부 분(0~23시, 24칸). 방에 있던 구간에 순공부를 펼쳐 담은 근사값이다 */
        List<Integer> hourlyFocusMinutes,
        long totalStudySeconds,
        long focusedSeconds,
        Integer totalScore,
        Integer focusScore,
        Integer goodPostureRatio,
        Integer goalMinutes,
        Integer weeklyGoalMinutes,
        Integer goalAchievementRate,
        BodyPartScores bodyPartScores,
        EventCounts eventCounts,
        PostureBreakdown postureBreakdown,
        PrevWeek prevWeek,
        int warningCount,
        Stretching stretching,
        Highlights highlights,
        List<WeekTrend> weeklyTrend,
        String summaryText,
        String aiFeedback) {

    /** 전주 값(배지 "전주 대비 +N%" 계산용). 차이가 아니라 원값을 내려 FE가 자유롭게 표기한다. 기록 없으면 null. */
    public record PrevWeek(Integer totalScore, Integer goodPostureRatio, int warningCount,
            BodyPartScores bodyPartScores, EventCounts eventCounts) {
    }

    public record Stretching(int attemptCount, int completedCount) {
    }

    /**
     * 학습 자세 하이라이트. bestPosture는 "바른 자세 캡처" 데이터가 아직 저장되지 않아 항상 null이다
     * (자세감지 파트의 캡처 업로드 구현 후 채워질 예정 — 그때까지 FE는 섹션을 숨기거나 자리표시자 처리).
     */
    public record Highlights(Highlight bestPosture, Highlight worstPosture) {
    }

    public static WeeklyReportSummaryResponse of(WeeklyMetrics m, String summaryText, String aiFeedback) {
        return new WeeklyReportSummaryResponse(
                "WEEKLY",
                m.weekStart(),
                m.weekEnd(),
                m.dailyStats(),
                m.hourlyFocusMinutes(),
                m.totalStudySeconds(),
                m.focusedSeconds(),
                m.totalScore(),
                m.focusScore(),
                m.goodPostureRatio(),
                m.goalMinutes(),
                m.weeklyGoalMinutes(),
                m.goalAchievementRate(),
                m.bodyPartScores(),
                m.eventCounts(),
                m.postureBreakdown(),
                new PrevWeek(m.prevTotalScore(), m.prevGoodPostureRatio(), m.prevWarningCount(),
                        m.prevBodyPartScores(), m.prevEventCounts()),
                m.warningCount(),
                new Stretching(m.stretchingAttemptCount(), m.stretchingCompletedCount()),
                new Highlights(null, m.worstPosture()),
                m.weeklyTrend(),
                summaryText,
                aiFeedback);
    }
}
