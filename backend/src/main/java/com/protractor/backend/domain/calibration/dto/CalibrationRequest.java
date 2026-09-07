package com.protractor.backend.domain.calibration.dto;

import com.protractor.backend.domain.posture.dto.PostureBaseline;
import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import java.math.BigDecimal;

/**
 * 캘리브레이션 저장 요청. 브라우저가 "바른 자세" 몇 초를 캡처해 피처 평균을 낸 결과를 보낸다.
 *
 * <p>
 * 회원 식별자는 본문에 없다. 액세스 토큰에서 꺼낸다 — 남의 기준선을 덮어쓸 수 있는 구멍을 남기지 않기 위해서다.
 *
 * @param baseline 기준선. calibrations.baseline_data에 JSON으로 저장된다
 * @param confidence 캘리브레이션 품질(0~100). 낮으면 다시 잡도록 안내한다
 * @param captureUrl 캘리브레이션 캡처 이미지(동의 시)
 */
@Schema(description = "캘리브레이션 저장 요청")
public record CalibrationRequest(@Schema(description = "바른 자세 기준선") @NotNull @Valid PostureBaseline baseline,
		@Schema(description = "캘리브레이션 품질(0~100)", example = "92.5") BigDecimal confidence,
		@Schema(description = "캡처 이미지 URL(동의 시)") String captureUrl) {
}
