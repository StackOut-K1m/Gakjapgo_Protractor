package com.protractor.backend.domain.report.dto;

import java.math.BigDecimal;
import java.time.LocalDate;

/**
 * 학습 캘린더용 study_records 한 행 발췌 — 학습일·시간·유지율과 방 이름.
 *
 * <p>
 * 한 날짜에 여러 방 기록이 있을 수 있어 날짜별 합치기는 서비스에서 한다(한 사람의 한 달 치는
 * 많아야 수십 행이라 DB GROUP BY가 필요 없고, 유지율은 순공부로 가중해야 해서 SQL AVG를 쓸 수 없다).
 */
public record DailyStudyRow(
        LocalDate studyDate,
        int totalStudySeconds,
        int focusedSeconds,
        BigDecimal goodPostureRatio,
        String roomTitle) {
}
