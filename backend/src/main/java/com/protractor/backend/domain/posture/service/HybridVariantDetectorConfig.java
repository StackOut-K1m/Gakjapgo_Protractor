package com.protractor.backend.domain.posture.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.io.ResourceLoader;

/**
 * 모델 파일만 다른 하이브리드 변형을 판정기로 등록한다. 화면에는 판정 방식 버튼이 그만큼 늘어난다.
 *
 * <p>
 * 같은 사람이 같은 자세로 앉아 버튼만 바꿔 누르며 <b>모델끼리</b> 맞대 보라고 만들었다. 판정 방식이 아니라 어떤 JSON을 실었는지만
 * 다르므로, 화면에서 나오는 차이는 전부 모델 차이다.
 *
 * <p>
 * <b>판정 흐름은 {@link HybridPostureDetector}와 글자 그대로 같다.</b> 로직을 복사하지 않고 그 클래스를 그대로
 * 쓴다. 모델이 보는 피처 자체가 달라 클래스를 나눈 {@link HybridDeltaPostureDetector}와 구분되는 점이다.
 *
 * <p>
 * 여기 걸린 모델 파일은 재학습으로 덮어써도 된다. 이 구성은 파일 <b>경로</b>를 잡아 둘 뿐이라 내용이 바뀌면 바뀐 대로 싣는다.
 *
 * <p>
 * <b>왜 클래스가 아니라 {@code @Bean}인가.</b> 변형은 설정 몇 줄로 늘었다 줄었다 하는 것이라 하나 추가할 때마다 클래스를
 * 만드는 것은 과하다. 여기에 메서드 하나와 {@code application.yml}에 블록 하나를 더하면 끝이고,
 * {@link PostureDetectorRegistry}가 알아서 주워 담아 목록과 화면 버튼에 띄운다. 실험이 끝나 변형을 걷어낼 때도 이 파일과
 * 설정만 지우면 된다.
 *
 * <p>
 * 각 변형은 {@code enabled=false}로 따로 끌 수 있다. 모델 중 하나가 깨졌을 때 나머지까지 기동이 막히지 않게 하기 위해서다.
 */
@Configuration
public class HybridVariantDetectorConfig {

	/**
	 * {@code *_model_1.json}으로 판정하는 변형.
	 *
	 * <p>
	 * 이름을 키와 따로 두는 이유는 {@code events.metadata}에 남는 값이 이름이기 때문이다. 키
	 * ({@code hybrid-v1})는 요청 본문과 설정이 쓰는 값이라 바뀌면 클라이언트가 깨지지만, 이름은 나중에 정확도를 판정기별로 갈라
	 * 볼 때 쓰는 값이다.
	 */
	@Bean
	@ConditionalOnProperty(name = "app.posture.hybrid-v1.enabled", havingValue = "true", matchIfMissing = true)
	PostureDetector hybridV1Detector(RuleBasedPostureDetector ruleBased, ResourceLoader resourceLoader,
			ObjectMapper objectMapper, @Value("${app.posture.hybrid-v1.forward-head-model:}") String forwardHeadModel,
			@Value("${app.posture.hybrid-v1.shoulder-tilt-model:}") String shoulderTiltModel,
			@Value("${app.posture.hybrid-v1.severity-probabilities}") double[] severityProbabilities) {
		return variant("hybrid-v1", "hybrid-logistic-v1-model1", "하이브리드와 같은 방식이되, *_model_1.json 모델로 판정한다.",
				ruleBased, resourceLoader, objectMapper, forwardHeadModel, shoulderTiltModel, severityProbabilities);
	}

	/** {@code *_model_2.json}으로 판정하는 변형. 나머지는 {@link #hybridV1Detector}와 같다. */
	@Bean
	@ConditionalOnProperty(name = "app.posture.hybrid-v2.enabled", havingValue = "true", matchIfMissing = true)
	PostureDetector hybridV2Detector(RuleBasedPostureDetector ruleBased, ResourceLoader resourceLoader,
			ObjectMapper objectMapper, @Value("${app.posture.hybrid-v2.forward-head-model:}") String forwardHeadModel,
			@Value("${app.posture.hybrid-v2.shoulder-tilt-model:}") String shoulderTiltModel,
			@Value("${app.posture.hybrid-v2.severity-probabilities}") double[] severityProbabilities) {
		return variant("hybrid-v2", "hybrid-logistic-v1-model2", "하이브리드와 같은 방식이되, *_model_2.json 모델로 판정한다.",
				ruleBased, resourceLoader, objectMapper, forwardHeadModel, shoulderTiltModel, severityProbabilities);
	}

	/**
	 * 변형 하나를 만든다. 모델을 못 읽으면 {@code loadModels}가 기동에서 막는다 — 조용히 규칙 기반으로 흘러가면 어느 모델로
	 * 판정한 것인지 알 수 없는 데이터가 쌓인다.
	 */
	private static PostureDetector variant(String key, String name, String description,
			RuleBasedPostureDetector ruleBased, ResourceLoader resourceLoader, ObjectMapper objectMapper,
			String forwardHeadModel, String shoulderTiltModel, double[] severityProbabilities) {
		return new HybridPostureDetector(key, name, description, ruleBased, severityProbabilities,
				HybridPostureDetector.loadModels(key, resourceLoader, objectMapper, forwardHeadModel,
						shoulderTiltModel));
	}
}
