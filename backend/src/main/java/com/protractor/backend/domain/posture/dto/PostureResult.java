package com.protractor.backend.domain.posture.dto;

import com.protractor.backend.domain.posture.entity.PostureType;
import io.swagger.v3.oas.annotations.media.Schema;
import java.math.BigDecimal;
import java.util.List;

/**
 * 한 프레임에 대한 자세 판정 결과. 3종 자세 각각의 판정을 담는다.
 *
 * <p>
 * 판정 방식(규칙·하이브리드·이미지)이 무엇이든 결과는 이 타입으로 통일된다. 그래야 방식을 바꿔도 뒤쪽(30초 윈도우, 이벤트 저장, 점수
 * 계산)을 손대지 않고, 나중에 세 방식의 정확도를 같은 기준으로 비교할 수 있다.
 *
 * @param detectorName 어떤 판정기가 낸 결과인지. events.metadata에 남겨 비교 실험에 쓴다
 * @param judgements 3종 판정. 판정 보류된 항목도 포함된다
 */
@Schema(description = "자세 판정 결과(3종 독립)")
public record PostureResult(
		@Schema(description = "판정기 이름", example = "rule-based-v1") String detectorName,
		@Schema(description = "자세 3종 판정") List<Judgement> judgements) {

	/**
	 * 자세 1종에 대한 판정.
	 *
	 * @param type 자세 종류
	 * @param severity 심각도 0~5. 0은 정상이고, 판정 보류면 null이다
	 * @param deviationDegrees 기준선 대비 이탈 각도. events.deviation_degrees에 그대로 저장된다
	 * @param skipReason 판정을 보류한 이유. 보류가 아니면 null
	 */
	@Schema(description = "자세 1종 판정")
	public record Judgement(PostureType type, Integer severity, BigDecimal deviationDegrees, String skipReason) {

		/** 정상 판정. */
		public static Judgement normal(PostureType type, BigDecimal deviationDegrees) {
			return new Judgement(type, 0, deviationDegrees, null);
		}

		/** 나쁜 자세 판정. */
		public static Judgement detected(PostureType type, int severity, BigDecimal deviationDegrees) {
			return new Judgement(type, severity, deviationDegrees, null);
		}

		/**
		 * 판정 보류.
		 *
		 * <p>
		 * 랜드마크가 가려졌거나 몸통이 크게 틀어졌을 때는 정상이라고도 나쁘다고도 할 수 없다. 이때 정상으로 처리하면 나쁜 자세를 놓치고,
		 * 나쁨으로 처리하면 오탐이 된다. 그래서 어느 쪽도 아닌 상태로 두고 30초 윈도우에서도 제외한다.
		 */
		public static Judgement skipped(PostureType type, String reason) {
			return new Judgement(type, null, null, reason);
		}

		/** 윈도우 집계에 넣을 수 있는 판정인지. 보류된 프레임은 통계를 왜곡하므로 제외한다. */
		public boolean isEvaluated() {
			return severity != null;
		}
	}
}
