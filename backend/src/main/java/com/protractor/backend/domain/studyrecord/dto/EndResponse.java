package com.protractor.backend.domain.studyrecord.dto;

import com.protractor.backend.domain.studyrecord.entity.StudyRecord;
import io.swagger.v3.oas.annotations.media.Schema;
import java.math.BigDecimal;
import java.time.LocalDateTime;

/** 세션 종료 응답. 종료 직후 결과 화면에 필요한 통계·점수를 담는다. */
@Schema(description = "세션 종료 응답(서버 계산 점수 포함)")
public record EndResponse(Long studyRecordId, LocalDateTime leftAt, String endReason, int totalStudySeconds,
		int focusedSeconds, int badPostureSeconds, int warningCount, BigDecimal goodPostureRatio, BigDecimal focusScore,
		BigDecimal neckScore, BigDecimal chinRestScore, BigDecimal shoulderTiltScore, BigDecimal totalScore) {

	public static EndResponse from(StudyRecord r) {
		return new EndResponse(r.getId(), r.getLeftAt(), r.getEndReason(), r.getTotalStudySeconds(),
				r.getFocusedSeconds(), r.getBadPostureSeconds(), r.getWarningCount(), r.getGoodPostureRatio(),
				r.getFocusScore(), r.getNeckScore(), r.getChinRestScore(), r.getShoulderTiltScore(), r.getTotalScore());
	}
}
