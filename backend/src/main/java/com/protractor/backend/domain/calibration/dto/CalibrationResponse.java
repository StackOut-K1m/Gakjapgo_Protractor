package com.protractor.backend.domain.calibration.dto;

import com.protractor.backend.domain.calibration.entity.Calibration;
import com.protractor.backend.domain.posture.dto.PostureBaseline;
import io.swagger.v3.oas.annotations.media.Schema;
import java.math.BigDecimal;
import java.time.LocalDateTime;

/** 캘리브레이션 조회·저장 응답. */
@Schema(description = "캘리브레이션 응답")
public record CalibrationResponse(Long calibrationId, Long memberId, PostureBaseline baseline, BigDecimal confidence,
		String captureUrl, LocalDateTime calibratedAt) {

	public static CalibrationResponse of(Calibration c, PostureBaseline baseline) {
		return new CalibrationResponse(c.getId(), c.getMemberId(), baseline, c.getConfidence(), c.getCaptureUrl(),
				c.getCalibratedAt());
	}
}
