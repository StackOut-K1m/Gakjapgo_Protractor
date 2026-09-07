package com.protractor.backend.domain.posture.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.Valid;
import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotNull;

/**
 * 자세 피처 벡터 v1. 브라우저가 MediaPipe 키포인트에서 뽑아 보내는 값이며, 판정 방식 3종(규칙·하이브리드·이미지)이 모두 이
 * 벡터를 공통 입력으로 쓴다.
 *
 * <p>
 * 원본 좌표를 그대로 쓰면 카메라 거리·해상도·체형에 따라 값이 제각각이라 임계값을 정할 수 없다. 그래서 브라우저에서 <b>어깨 중점을
 * 원점으로 옮기고 어깨 너비로 나눈</b> 무차원 비율만 보낸다. 덕분에 전송량도 작아서 1Hz로 보내도 부담이 없다.
 *
 * <p>
 * 이 필드 구성은 v1으로 동결한다. 방법 A/B/C의 정확도를 비교하려면 세 방식이 같은 입력을 받아야 하므로, 필드를 바꿀 때는 v2를 새로
 * 만들고 데이터셋도 함께 다시 수집해야 한다.
 *
 * <p>
 * {@code mlFeatures}는 그 동결을 깨지 않으려고 <b>덧붙인</b> 선택 블록이다. 학습 모델이 v1에 없는 값(눈 좌표·깊이)을
 * 쓰기 때문에 필요한데, v1 필드를 건드리면 규칙 기반 판정기와 기존 캘리브레이션 기준선이 모두 무효가 된다. 이 블록이 비어 있어도 판정은
 * 예전과 똑같이 동작한다.
 *
 * @param capturedAtMillis 브라우저 기준 촬영 시각(epoch ms). 서버 수신 시각과 다를 수 있어 함께 받는다
 * @param earShoulderOffsetRatio 귀와 어깨 중점의 <b>수평</b> 거리 / 어깨 너비. 거북목 주지표(클수록 앞으로
 *     나옴)
 * @param earShoulderVerticalRatio 귀와 어깨의 <b>수직</b> 거리 / 어깨 너비. 거북목 각도 계산의 분모
 * @param shoulderToFaceWidthRatio 어깨 너비 / 얼굴 너비. 라운드숄더 주지표(어깨가 말리면 정면 폭이 줄어 값이
 *     작아진다). 얼굴 너비로 나누는 이유는 카메라와의 거리가 변해도 비율이 유지되기 때문이다
 * @param shoulderTiltRatio (왼쪽 어깨 y - 오른쪽 어깨 y) / 어깨 너비. 어깨 높낮이 주지표. <b>부호를
 *     유지</b>해서 어느 쪽이 올라갔는지 구분한다
 * @param torsoRotationRatio 좌우 어깨가 코에서 떨어진 거리의 차이 / 어깨 너비. 몸통이 얼마나 틀어졌는지 추정한다.
 *     회전에 취약한 자세는 이 값이 크면 판정을 보류한다
 * @param neckFlexionRatio 코와 어깨 중점의 수직 거리 / 어깨 너비. 고개 숙임 정도(보조 지표)
 * @param faceWidthRatio 얼굴 너비 / 어깨 너비. 정규화가 정상인지 확인하는 검증용 값
 * @param earVisibility 좌우 귀 랜드마크 신뢰도의 최솟값(0~1). 낮으면 거북목 판정을 보류한다
 * @param shoulderVisibility 좌우 어깨 랜드마크 신뢰도의 최솟값(0~1). 낮으면 어깨 관련 판정을 보류한다
 * @param mlFeatures 학습 모델 전용 피처 블록(선택). 하이브리드 판정기만 쓰며, 없으면 규칙 기반으로 판정한다
 */
@Schema(description = "자세 피처 벡터 v1(브라우저에서 정규화 완료)")
public record PostureFeatures(
		@Schema(description = "촬영 시각(epoch ms)", example = "1769472000000") @NotNull Long capturedAtMillis,
		@Schema(description = "귀-어깨 수평거리 / 어깨너비", example = "0.18") @NotNull Double earShoulderOffsetRatio,
		@Schema(description = "귀-어깨 수직거리 / 어깨너비", example = "0.62") @NotNull Double earShoulderVerticalRatio,
		@Schema(description = "어깨너비 / 얼굴너비", example = "2.35") @NotNull Double shoulderToFaceWidthRatio,
		@Schema(description = "좌우 어깨 높이차 / 어깨너비(부호 유지)", example = "-0.04") @NotNull Double shoulderTiltRatio,
		@Schema(description = "몸통 회전 추정치", example = "0.09") @NotNull Double torsoRotationRatio,
		@Schema(description = "코-어깨중점 수직거리 / 어깨너비", example = "0.71") @NotNull Double neckFlexionRatio,
		@Schema(description = "얼굴너비 / 어깨너비", example = "0.43") @NotNull Double faceWidthRatio,
		@Schema(description = "귀 랜드마크 신뢰도(0~1)", example = "0.93") @NotNull @DecimalMin("0.0") @DecimalMax("1.0") Double earVisibility,
		@Schema(description = "어깨 랜드마크 신뢰도(0~1)", example = "0.97") @NotNull @DecimalMin("0.0") @DecimalMax("1.0") Double shoulderVisibility,
		@Schema(description = "학습 모델 전용 피처(선택). 하이브리드 판정기에서만 쓴다") @Valid PostureMlFeatures mlFeatures) {

	/** ML 블록 없이 v1 필드만으로 만든다. 규칙 기반 판정과 테스트에서 쓴다. */
	public PostureFeatures(Long capturedAtMillis, Double earShoulderOffsetRatio, Double earShoulderVerticalRatio,
			Double shoulderToFaceWidthRatio, Double shoulderTiltRatio, Double torsoRotationRatio,
			Double neckFlexionRatio, Double faceWidthRatio, Double earVisibility, Double shoulderVisibility) {
		this(capturedAtMillis, earShoulderOffsetRatio, earShoulderVerticalRatio, shoulderToFaceWidthRatio,
				shoulderTiltRatio, torsoRotationRatio, neckFlexionRatio, faceWidthRatio, earVisibility,
				shoulderVisibility, null);
	}

	/** 피처 벡터 버전. events.metadata에 함께 남겨 어떤 규격으로 판정했는지 나중에 알 수 있게 한다. */
	public static final String VERSION = "v1";
}
