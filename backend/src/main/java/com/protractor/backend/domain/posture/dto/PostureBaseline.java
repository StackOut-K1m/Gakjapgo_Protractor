package com.protractor.backend.domain.posture.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;

/**
 * 캘리브레이션 기준선. 세션 시작 시 "바른 자세"를 몇 초 캡처해 얻은 피처 평균값이며, calibrations.baseline_data
 * (JSON)에 그대로 저장된다.
 *
 * <p>
 * 자세 판정에서 가장 큰 오차 원인은 체형 개인차다. 목이 원래 긴 사람과 어깨가 원래 비대칭인 사람에게 같은 절대 임계값을 적용하면 한쪽은
 * 계속 경고를 받고 다른 쪽은 아무리 구부려도 안 걸린다. 그래서 판정은 절대값이 아니라 <b>이 기준선 대비 얼마나 나빠졌는지</b>로
 * 한다.
 *
 * @param version 이 기준선을 만들 때 쓴 피처 벡터 버전. 판정 시점의 버전과 다르면 재캘리브레이션이 필요하다
 * @param earShoulderOffsetRatio 바른 자세일 때의 귀-어깨 수평거리 비율
 * @param earShoulderVerticalRatio 바른 자세일 때의 귀-어깨 수직거리 비율
 * @param shoulderToFaceWidthRatio 바른 자세일 때의 어깨너비/얼굴너비. 라운드숄더 판정의 기준 폭
 * @param shoulderTiltRatio 바른 자세일 때의 좌우 어깨 높이차. 원래 비대칭인 사람을 위해 부호까지 기억한다
 * @param sampleCount 평균을 낸 프레임 수. 너무 적으면 기준선을 믿기 어렵다
 * @param mlBaseline 바른 자세일 때의 ML 피처 평균(선택). 델타 학습 모델이 "이 사람 기준 대비 얼마나
 *     벗어났는가"를 계산하는 데 쓴다
 */
@Schema(description = "캘리브레이션 기준선(바른 자세 피처 평균)")
public record PostureBaseline(
		@Schema(description = "피처 벡터 버전", example = "v1") @NotNull String version,
		@Schema(description = "기준 귀-어깨 수평거리 비율", example = "0.11") @NotNull Double earShoulderOffsetRatio,
		@Schema(description = "기준 귀-어깨 수직거리 비율", example = "0.64") @NotNull Double earShoulderVerticalRatio,
		@Schema(description = "기준 어깨너비/얼굴너비", example = "2.52") @NotNull @Positive Double shoulderToFaceWidthRatio,
		@Schema(description = "기준 좌우 어깨 높이차(부호 유지)", example = "-0.01") @NotNull Double shoulderTiltRatio,
		@Schema(description = "평균을 낸 프레임 수", example = "150") @NotNull @Positive Integer sampleCount,
		@Schema(description = "바른 자세일 때의 ML 피처 평균(델타 판정기용, 선택)") @Valid PostureMlFeatures mlBaseline) {

	/**
	 * ML 기준선 없이 만든다. 기존 코드·테스트와 DB에 이미 저장된 기준선(이 필드가 없는 JSON)이 그대로 동작하게 두려는 것이다.
	 *
	 * <p>
	 * {@link PostureFeatures}가 {@code mlFeatures}를 덧붙일 때 쓴 방식과 같다. 델타 판정기만 이 값을 보고,
	 * 나머지 판정기는 예전과 똑같이 동작한다.
	 */
	public PostureBaseline(String version, Double earShoulderOffsetRatio, Double earShoulderVerticalRatio,
			Double shoulderToFaceWidthRatio, Double shoulderTiltRatio, Integer sampleCount) {
		this(version, earShoulderOffsetRatio, earShoulderVerticalRatio, shoulderToFaceWidthRatio, shoulderTiltRatio,
				sampleCount, null);
	}

	/** 판정에 쓸 수 있는 기준선인지. 버전이 다르면 지표 정의가 달라 비교 자체가 성립하지 않는다. */
	public boolean isCompatible() {
		return PostureFeatures.VERSION.equals(version) && shoulderToFaceWidthRatio > 0;
	}
}
