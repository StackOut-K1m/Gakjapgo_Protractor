package com.protractor.backend.domain.posture.dto;

import io.swagger.v3.oas.annotations.media.Schema;

/**
 * 고를 수 있는 판정기 한 개.
 *
 * <p>
 * 설명 문구까지 서버가 내려주는 이유는, 새 판정 방식을 추가할 때 프론트엔드를 고치지 않기 위해서다. 브라우저는 목록을 받아 버튼을 그리기만
 * 하므로 방식이 몇 개가 되든 화면 코드는 그대로다.
 *
 * @param key 요청 본문 {@code detector}에 넣는 값
 * @param name 판정 버전까지 포함한 이름. {@code events.metadata}에 남는 값과 같다
 * @param description 버튼에 띄울 한 줄 설명
 * @param isDefault 요청이 판정기를 지정하지 않았을 때 쓰이는 것인지
 */
@Schema(description = "선택 가능한 자세 판정기")
public record PostureDetectorResponse(@Schema(description = "요청에 넣는 키", example = "hybrid") String key,
		@Schema(description = "판정 버전 포함 이름", example = "hybrid-logistic-v1") String name,
		@Schema(description = "한 줄 설명") String description,
		@Schema(description = "서버 기본 판정기인지") boolean isDefault) {
}
