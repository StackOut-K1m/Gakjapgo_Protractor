package com.protractor.backend.domain.report.dto;

import java.time.LocalDateTime;

/**
 * 시간대 분포 집계용 study_records 한 행 발췌 — 방에 있던 구간과 그 중 순공부 시간.
 *
 * <p>
 * {@link StudyRecordRow}와 따로 두는 이유: 그쪽은 학습일(DATE) 단위 합계라서 "몇 시에 공부했는지"를
 * 알 수 없다. 시각이 필요한 건 이 집계 하나뿐이라 필요한 세 칸만 따로 읽는다.
 */
public record StudySpanRow(LocalDateTime joinedAt, LocalDateTime leftAt, int focusedSeconds) {
}
