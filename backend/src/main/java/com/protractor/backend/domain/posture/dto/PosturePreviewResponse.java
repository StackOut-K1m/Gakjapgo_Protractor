package com.protractor.backend.domain.posture.dto;

import com.protractor.backend.domain.posture.dto.PostureResult.Judgement;
import io.swagger.v3.oas.annotations.media.Schema;
import java.util.List;

/**
 * 기준선 없는 한 프레임 판정 응답(입장 준비화면).
 *
 * <p>
 * {@link PostureFrameResponse}와 달리 confirmed·resolved가 없다. 30초 윈도우는 세션에 딸린 상태이고 준비화면에는
 * 세션이 없다. 저장도 하지 않으므로 이 응답이 남기는 것은 없다.
 *
 * <p>
 * 각 판정의 {@code deviationDegrees}는 항상 null이다 — 각도는 기준선 대비로만 뜻이 있는 값이라, 기준선이 없는 이 경로에서는
 * 만들 수 없다. 화면은 심각도만 보면 된다.
 *
 * @param judgements 자세별 판정. 모델이 없거나 프레임을 믿을 수 없으면 보류로 담긴다
 * @param detector 실제로 판정에 쓰인 판정기 키
 */
@Schema(description = "기준선 없는 한 프레임 판정 응답(준비화면)")
public record PosturePreviewResponse(
		@Schema(description = "자세별 판정(각도는 항상 null)") List<Judgement> judgements,
		@Schema(description = "실제로 판정에 쓰인 판정기 키", example = "hybrid") String detector) {

	public static PosturePreviewResponse of(PostureResult result, String detectorKey) {
		return new PosturePreviewResponse(result.judgements(), detectorKey);
	}
}
