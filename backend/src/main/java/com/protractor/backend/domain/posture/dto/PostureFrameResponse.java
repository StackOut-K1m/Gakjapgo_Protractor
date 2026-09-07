package com.protractor.backend.domain.posture.dto;

import com.protractor.backend.domain.posture.dto.PostureResult.Judgement;
import com.protractor.backend.domain.posture.entity.PostureType;
import io.swagger.v3.oas.annotations.media.Schema;
import java.util.List;

/**
 * 자세 프레임 판정 응답.
 *
 * <p>
 * 이번 프레임 판정과, 이번에 새로 확정되거나 해소된 항목을 함께 준다. 프론트는 확정 목록을 보고 경고를 띄운다. WebSocket 알림이
 * 붙기 전까지는 이 응답이 알림 통로 역할을 한다.
 *
 * @param goodPosture 3종이 모두 정상인지. 하나라도 나쁘면 false, 전부 보류면 판단 불가라 false가 아니라 true로
 *     두지 않도록 주의해야 해서 별도 필드로 명시한다
 * @param judgements 3종 각각의 판정(보류 포함)
 * @param confirmed 이번에 알려야 하는 나쁜 자세. 30초 지속이 처음 확정된 자세와, 이미 확정됐지만 고쳐지지 않아 30초를 더 버틴
 *     자세가 함께 들어온다. 프론트는 이 목록으로 경고를 띄우고 카운트를 올린다. 둘을 구분하지 않는 이유는 화면 입장에서 할 일이 같기
 *     때문이다. 이벤트를 새로 여는 것은 전자뿐이지만 그것은 서버 안의 사정이다
 * @param resolved 이번에 해소된 자세
 * @param detector 이 프레임을 실제로 판정한 판정기 키. 요청이 지정하지 않으면 서버 기본값이 쓰이므로, 보낸 값이 아니라 <b>쓰인
 *     값</b>을 돌려준다. 비교 실험 중에 선택이 반영됐는지 화면에서 바로 확인할 수 있어야 한다
 */
@Schema(description = "자세 프레임 판정 응답")
public record PostureFrameResponse(
		@Schema(description = "3종 모두 정상인지(보류가 있으면 판단 보류로 false)") boolean goodPosture,
		@Schema(description = "3종 판정 결과") List<Judgement> judgements,
		@Schema(description = "이번에 알려야 하는 나쁜 자세(최초 확정 + 고쳐지지 않아 30초를 더 지속한 것)") List<PostureType> confirmed,
		@Schema(description = "이번에 해소된 자세") List<PostureType> resolved,
		@Schema(description = "실제로 판정에 쓰인 판정기 키", example = "hybrid") String detector) {

	public static PostureFrameResponse of(PostureResult result, List<PostureType> confirmed, List<PostureType> resolved,
			String detectorKey) {
		// 보류가 하나라도 있으면 "정상"이라고 말할 수 없다. 가려진 부위가 나쁜 자세일 수도 있기 때문이다.
		boolean allNormal = result.judgements().stream().allMatch(j -> j.isEvaluated() && j.severity() == 0);
		return new PostureFrameResponse(allNormal, result.judgements(), confirmed, resolved, detectorKey);
	}
}
