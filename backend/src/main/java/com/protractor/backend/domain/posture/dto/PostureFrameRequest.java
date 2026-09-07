package com.protractor.backend.domain.posture.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;

/**
 * 자세 프레임 판정 요청. 브라우저가 1초에 한 번 보낸다.
 *
 * <p>
 * 30초 지속을 보고 알림을 내므로 초당 1회면 충분하다. 매 프레임(30fps) 보내는 것에 비해 전송량이 30분의 1이고, 이미 화상 스트림이
 * 나가고 있는 상황에서 이 정도는 무시할 수준이다.
 *
 * <p>
 * 회원 id는 받지 않는다. 세션(studyRecordId)에 이미 회원이 붙어 있어서 서버가 찾으면 되고, 클라이언트가 남의 id를 보내는 것도
 * 막을 수 있다.
 *
 * <p>
 * {@code detector}는 판정 방식을 비교하려고 뚫어 둔 자리다. 프레임마다 받는 이유는, 세션 중에 자세를 그대로 두고 방식만 바꿔야 두
 * 결과를 같은 조건에서 맞대볼 수 있기 때문이다. 어느 방식으로 판정했는지는 {@code events.metadata}에 남는다.
 */
@Schema(description = "자세 프레임 판정 요청")
public record PostureFrameRequest(@Schema(description = "정규화된 피처 벡터") @NotNull @Valid PostureFeatures features,
		@Schema(description = "사용할 판정기 키. 비우면 서버 기본값(app.posture.detector). 목록은 GET /api/v1/posture-detectors", example = "hybrid", nullable = true) String detector) {
}
