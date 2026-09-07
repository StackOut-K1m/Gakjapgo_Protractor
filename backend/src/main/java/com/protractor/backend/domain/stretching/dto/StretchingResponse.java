package com.protractor.backend.domain.stretching.dto;

import com.protractor.backend.domain.stretching.entity.Stretching;

import io.swagger.v3.oas.annotations.media.Schema;

// record를 쓰면 생성자, getter 같은 걸 자동으로 만들어 준다.
@Schema(description = "스트레칭 가이드 응답")
public record StretchingResponse(@Schema(description = "스트레칭 ID", example = "1") Long stretchingId,

		@Schema(description = "스트레칭 이름", example = "목 뒤로 당기기") String name,

		@Schema(description = "대상 부위", example = "NECK") String targetPart,

		@Schema(description = "안내 문구", example = "허리를 펴고 턱을 살짝 당긴 상태로 목 뒤쪽을 늘려주세요.") String guideText,

		@Schema(description = "강조할 랜드마크 JSON 문자열", example = "[\"NOSE\",\"LEFT_SHOULDER\",\"RIGHT_SHOULDER\"]") String highlightLandmarks,

		@Schema(description = "유지 시간(초)", example = "30") int holdSeconds,

		@Schema(description = "정렬 순서", example = "1") int sortOrder) {

	public static StretchingResponse from(Stretching stretching) {
		return new StretchingResponse(stretching.getId(), stretching.getName(), stretching.getTargetPart(),
				stretching.getGuideText(), stretching.getHighlightLandmarks(), stretching.getHoldSeconds(),
				stretching.getSortOrder());
	}
}
