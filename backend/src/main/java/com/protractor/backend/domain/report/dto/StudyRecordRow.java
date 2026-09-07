package com.protractor.backend.domain.report.dto;

import java.math.BigDecimal;
import java.time.LocalDate;

/**
 * 주간 집계용 study_records 한 행 발췌. 합산·평균은 서비스에서 자바로 계산한다.
 * (한 회원의 한 주 치 기록은 많아야 수십 행이라 DB GROUP BY가 필요 없다)
 */
public record StudyRecordRow(
        LocalDate studyDate,
        int totalStudySeconds,
        int focusedSeconds,
        int breakSeconds,
        int awaySeconds,
        BigDecimal goodPostureRatio,
        BigDecimal focusScore,
        BigDecimal neckScore,
        /** 턱 괴기 점수 */
        BigDecimal chinRestScore,
        BigDecimal shoulderTiltScore,
        BigDecimal totalScore,
        int warningCount,
        int stretchingAttemptCount,
        int stretchingCompletedCount) {
}
