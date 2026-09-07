package com.protractor.backend.domain.posture.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.core.io.ResourceLoader;
import org.springframework.stereotype.Service;

/**
 * 개인 기준선 델타 판정기(방법 B'). 하이브리드와 같되, 모델이 <b>캘리브레이션 기준선 대비 편차</b>를 함께 본다.
 *
 * <p>
 * 하이브리드의 약점을 메우려고 만들었다. 하이브리드는 심각도를 모델이 정하는데 그 모델은 절대 기준이라, 목이 원래 긴 사람은 바른 자세로
 * 앉아 있어도 거북목 확률이 높게 나온다. 규칙 기반은 캘리브레이션 대비 편차로 판정해 이 문제가 없지만, 하이브리드로 넘어가는 순간 개인차
 * 보정이 통째로 빠진다.
 *
 * <p>
 * 그래서 학습 쪽에서 {@code d_<피처> = 현재 - 그 사람의 바른 자세 평균}을 피처로 추가해 다시 학습했고
 * ({@code ai/train.ipynb} 12절 {@code train_delta}), 이 판정기가 그 모델을 싣는다. 델타를 만드는 계산은
 * {@link LogisticPostureModel}이 하고, 여기서는 어떤 모델 파일을 읽을지만 다르다.
 *
 * <p>
 * <b>원본 피처를 버리지 않는다.</b> 델타만 쓰면 체형이 상수째로 소거되면서 두 가지를 같이 잃는다. 하나는 같은 델타라도 절대 위치에
 * 따라 심각도가 다르다는 것이고, 다른 하나는 캘리브레이션 자체가 나쁜 자세였을 때 영영 정상으로 보인다는 것이다. 모델은 원본 12개와 델타를
 * 모두 받아 스스로 고른다.
 *
 * <p>
 * <b>자세마다 델타 모델을 쓰지 않아도 된다.</b> 6명 데이터에서 델타는 거북목만 개선했고(F1 0.617 → 0.676) 어깨
 * 높낮이는 오히려 조금 나빠졌다. 그래서 어깨 높낮이는 기존 모델을 그대로 가리키게 두었다 — 설정에서 파일만 바꾸면 되고 코드는 손대지
 * 않는다.
 *
 * <p>
 * 옛 회원은 기준선에 ML 평균이 없다. 그 경우 규칙 기반으로 흘리지 않고 {@code NO_ML_BASELINE}으로 보류한다
 * ({@link HybridPostureDetector}의 판정 참고). 델타로 실험한 줄 알고 규칙 기반 결과를 모으는 사고를 막기 위해서다.
 */
@Service
@ConditionalOnProperty(name = "app.posture.hybrid-delta.enabled", havingValue = "true", matchIfMissing = true)
public class HybridDeltaPostureDetector extends HybridPostureDetector {

	/** API·설정에서 쓰는 키. 판정 버전이 올라가도 이 값은 그대로 둔다. */
	static final String KEY = "hybrid-delta";

	private static final String NAME = "hybrid-delta-logistic-v1";

	private static final String DESCRIPTION = "하이브리드와 같되, 모델이 캘리브레이션 기준선 대비 편차까지 본다(체형 개인차 보정).";

	public HybridDeltaPostureDetector(RuleBasedPostureDetector ruleBased, ResourceLoader resourceLoader,
			ObjectMapper objectMapper,
			@Value("${app.posture.hybrid-delta.forward-head-model:}") String forwardHeadModel,
			@Value("${app.posture.hybrid-delta.shoulder-tilt-model:}") String shoulderTiltModel,
			@Value("${app.posture.hybrid-delta.severity-probabilities}") double[] severityProbabilities) {
		super(KEY, NAME, DESCRIPTION, ruleBased, severityProbabilities,
				loadModels(KEY, resourceLoader, objectMapper, forwardHeadModel, shoulderTiltModel));
	}
}
