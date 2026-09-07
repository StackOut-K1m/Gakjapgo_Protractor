package com.protractor.backend.domain.posture.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.boot.convert.ApplicationConversionService;
import org.springframework.boot.test.context.ConfigDataApplicationContextInitializer;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.context.ConfigurableApplicationContext;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Import;
import org.springframework.context.support.PropertySourcesPlaceholderConfigurer;
import org.springframework.core.convert.ConversionService;
import org.springframework.web.server.ResponseStatusException;

/**
 * 판정기 등록과 선택이 의도대로 되는지 확인한다.
 *
 * <p>
 * 이 검증이 필요한 이유는 실패 방식이 나쁘기 때문이다. 요청이 고른 판정기가 조용히 무시되고 기본값으로 흘러가면, 하이브리드로 실험한 줄
 * 알고 며칠치 데이터를 버리게 된다. 반대로 키가 겹치거나 기본값이 등록되지 않았는데 기동이 되면 어느 것이 돌고 있는지 알 수 없다. 둘 다
 * 배포하고 나서야 알게 되는 종류라 여기서 미리 잡는다.
 *
 * <p>
 * 모델 파일이 클래스패스에 실려 있는지도 여기서 함께 확인된다. jar에 안 들어가면 기동이 실패한다.
 */
class PostureDetectorWiringTest {

	/**
	 * 배선 검증에는 전용 픽스처를 쓴다(src/test/resources).
	 *
	 * <p>
	 * 프로덕션 모델을 읽으면 재학습으로 피처가 바뀌는 동안 빈 등록·선택 검증까지 같이 멈춘다. 모델 내용이 바뀌었는지는
	 * {@code HybridPostureDetectorTest}가 실제 파일로 따로 본다.
	 */
	private static final String TEST_MODEL = "app.posture.hybrid.forward-head-model=classpath:models/wiring-test-model.json";

	private final ApplicationContextRunner contextRunner = new ApplicationContextRunner()
			.withUserConfiguration(DetectorConfig.class)
			.withPropertyValues("app.posture.detector=rule-based", "app.posture.min-visibility=0.5",
					"app.posture.max-torso-rotation=0.35", "app.posture.severity-degrees.forward-head=4,8,12,16,20",
					"app.posture.severity-degrees.rounded-shoulder=12,18,24,30,36",
					"app.posture.severity-degrees.shoulder-tilt=2,4,6,8,10",
					"app.posture.hybrid.severity-probabilities=0.40,0.55,0.70,0.85,0.95");

	@Test
	@DisplayName("판정기가 둘 다 등록되고, 목록은 키 순으로 고정된다")
	void bothDetectorsAreRegistered() {
		contextRunner.withPropertyValues(TEST_MODEL).run(context -> {
			PostureDetectorRegistry registry = context.getBean(PostureDetectorRegistry.class);

			// 주입 순서는 보장되지 않는다. 정렬하지 않으면 화면 버튼 순서가 배포마다 달라진다.
			assertThat(registry.all()).extracting(PostureDetector::key).containsExactly("hybrid", "rule-based");
		});
	}

	@Test
	@DisplayName("요청이 지정하지 않으면 설정한 기본 판정기를 쓴다")
	void fallsBackToConfiguredDefault() {
		contextRunner.withPropertyValues(TEST_MODEL).run(context -> {
			PostureDetectorRegistry registry = context.getBean(PostureDetectorRegistry.class);

			assertThat(registry.resolve(null).name()).isEqualTo("rule-based-v1");
			assertThat(registry.resolve("").name()).isEqualTo("rule-based-v1");
			assertThat(registry.defaultDetector().name()).isEqualTo("rule-based-v1");
		});
	}

	@Test
	@DisplayName("요청이 지정한 판정기로 바뀐다 — 서버를 다시 띄우지 않는다")
	void requestPicksDetector() {
		contextRunner.withPropertyValues(TEST_MODEL).run(context -> {
			PostureDetectorRegistry registry = context.getBean(PostureDetectorRegistry.class);

			assertThat(registry.resolve("hybrid").name()).isEqualTo("hybrid-logistic-v1");
			assertThat(registry.resolve("rule-based").name()).isEqualTo("rule-based-v1");
		});
	}

	@Test
	@DisplayName("모르는 판정기는 기본값으로 넘기지 않고 400으로 막는다")
	void unknownDetectorIsRejected() {
		contextRunner.withPropertyValues(TEST_MODEL).run(context -> {
			PostureDetectorRegistry registry = context.getBean(PostureDetectorRegistry.class);

			// 기본값으로 흘려 보내면 오타 하나로 실험 내내 엉뚱한 판정기가 돌면서도 화면에는 아무 표시가 없다.
			assertThatThrownBy(() -> registry.resolve("hibrid")).isInstanceOf(ResponseStatusException.class)
					.hasMessageContaining("hibrid").hasMessageContaining("rule-based");
		});
	}

	@Test
	@DisplayName("기본 판정기로 등록되지 않은 키를 적으면 기동에 실패한다")
	void failsFastWhenDefaultDetectorIsNotRegistered() {
		contextRunner.withPropertyValues(TEST_MODEL, "app.posture.detector=image-cnn").run(context -> {
			assertThat(context).hasFailed();
			// 이유까지 확인한다. 다른 이유로 기동에 실패해도 이 테스트는 통과해 버리기 때문이다.
			assertThat(context).getFailure().rootCause().hasMessageContaining("image-cnn");
		});
	}

	@Test
	@DisplayName("하이브리드를 끄면 규칙 기반만 남는다 — 모델이 깨졌을 때의 비상구다")
	void hybridCanBeDisabled() {
		contextRunner.withPropertyValues("app.posture.hybrid.enabled=false").run(context -> {
			assertThat(context).doesNotHaveBean(HybridPostureDetector.class);
			assertThat(context.getBean(PostureDetectorRegistry.class).all()).extracting(PostureDetector::key)
					.containsExactly("rule-based");
		});
	}

	@Test
	@DisplayName("하이브리드를 켜고 모델을 하나도 지정하지 않으면 조용히 넘어가지 않고 기동에 실패한다")
	void failsFastWhenHybridHasNoModel() {
		contextRunner.run(context -> {
			assertThat(context).hasFailed();
			assertThat(context).getFailure().rootCause().hasMessageContaining("학습된 모델이 하나도 없습니다");
		});
	}

	@Test
	@DisplayName("지정한 모델 파일이 없으면 규칙 기반으로 흘러가지 않고 기동에 실패한다")
	void failsFastWhenModelFileMissing() {
		contextRunner
				.withPropertyValues("app.posture.hybrid.forward-head-model=classpath:models/does-not-exist.json")
				.run(context -> {
					assertThat(context).hasFailed();
					assertThat(context).getFailure().rootCause().hasMessageContaining("does-not-exist.json");
				});
	}

	@Test
	@DisplayName("델타 판정기까지 세 종이 등록되고, 실제 델타 모델 파일이 클래스패스에 실려 있다")
	void deltaDetectorIsRegisteredAlongside() {
		// 델타 모델은 feature_order 에 d_* / abs_d_* 가 들어 있어 PostureMlFeatures 에서 이름을 찾을 수 없다.
		// 원본 피처 이름으로 확인하지 않으면 여기서 기동이 막힌다. jar 에 파일이 안 실려도 마찬가지다.
		new ApplicationContextRunner().withUserConfiguration(DeltaDetectorConfig.class)
				.withPropertyValues("app.posture.detector=rule-based", "app.posture.min-visibility=0.5",
						"app.posture.max-torso-rotation=0.35",
						"app.posture.severity-degrees.forward-head=4,8,12,16,20",
						"app.posture.severity-degrees.shoulder-tilt=2,4,6,8,10",
						"app.posture.hybrid.severity-probabilities=0.40,0.55,0.70,0.85,0.95",
						"app.posture.hybrid-delta.severity-probabilities=0.40,0.55,0.70,0.85,0.95", TEST_MODEL,
						"app.posture.hybrid-delta.forward-head-model=classpath:models/turtleneck_delta_model.json")
				.run(context -> {
					PostureDetectorRegistry registry = context.getBean(PostureDetectorRegistry.class);

					assertThat(registry.all()).extracting(PostureDetector::key).containsExactly("hybrid",
							"hybrid-delta", "rule-based");
					assertThat(registry.resolve("hybrid-delta").name()).isEqualTo("hybrid-delta-logistic-v1");
				});
	}

	@Test
	@DisplayName("application.yml 의 실제 설정만으로 판정기 세 종이 뜬다")
	void realApplicationYmlWiresAllDetectors() {
		// 위 테스트들은 속성값을 손으로 넣는다. 그래서 application.yml 의 모델 경로에 오타가 나거나
		// hybrid-delta 블록을 통째로 빠뜨려도 전부 통과한다. 그건 기동해 봐야 알게 되는 종류라
		// 여기서 진짜 설정 파일을 읽어 확인한다(빈은 이 구성의 것만 뜨고, 값만 application.yml 에서 온다).
		new ApplicationContextRunner().withUserConfiguration(DeltaDetectorConfig.class)
				.withInitializer(new ConfigDataApplicationContextInitializer()).run(context -> {
					assertThat(context).hasNotFailed();
					PostureDetectorRegistry registry = context.getBean(PostureDetectorRegistry.class);

					assertThat(registry.all()).extracting(PostureDetector::key).containsExactly("hybrid",
							"hybrid-delta", "rule-based");
					// 기본값은 그대로 하이브리드다. 델타를 추가하면서 기본 동작이 바뀌면 안 된다.
					assertThat(registry.defaultDetector().key()).isEqualTo("hybrid");
				});
	}

	@Test
	@DisplayName("application.yml 의 실제 설정만으로 변형 판정기까지 다섯 종이 뜬다")
	void realApplicationYmlWiresVariantDetectors() {
		// 위 테스트는 변형 구성을 import 하지 않아서, hybrid-v1/v2 의 모델 경로에 오타가 나도 통과한다.
		// 변형은 파일명이 세대별로 갈리는 만큼 오타가 나기 쉬워서 진짜 설정 파일로 따로 확인한다.
		new ApplicationContextRunner().withUserConfiguration(VariantDetectorConfig.class)
				.withInitializer(new ConfigDataApplicationContextInitializer()).run(context -> {
					assertThat(context).hasNotFailed();
					PostureDetectorRegistry registry = context.getBean(PostureDetectorRegistry.class);

					assertThat(registry.all()).extracting(PostureDetector::key).containsExactly("hybrid",
							"hybrid-delta", "hybrid-v1", "hybrid-v2", "rule-based");
					// 이름은 events.metadata 에 남아 판정기별 정확도를 가르는 값이라 서로 겹치면 안 된다.
					assertThat(registry.resolve("hybrid-v1").name()).isEqualTo("hybrid-logistic-v1-model1");
					assertThat(registry.resolve("hybrid-v2").name()).isEqualTo("hybrid-logistic-v1-model2");
					// 변형을 추가해도 기본값은 그대로 하이브리드다.
					assertThat(registry.defaultDetector().key()).isEqualTo("hybrid");
				});
	}

	@Test
	@DisplayName("변형 하나를 꺼도 나머지 판정기는 그대로 뜬다")
	void variantCanBeDisabledIndependently() {
		// 세대별 모델 중 하나가 깨졌을 때 그것만 내리고 계속 쓰기 위한 스위치다.
		// 같이 죽으면 모델 하나 때문에 판정 자체가 멈춘다.
		new ApplicationContextRunner().withUserConfiguration(VariantDetectorConfig.class)
				.withInitializer(new ConfigDataApplicationContextInitializer())
				.withPropertyValues("app.posture.hybrid-v1.enabled=false").run(context -> {
					assertThat(context).hasNotFailed();

					assertThat(context.getBean(PostureDetectorRegistry.class).all()).extracting(PostureDetector::key)
							.containsExactly("hybrid", "hybrid-delta", "hybrid-v2", "rule-based");
				});
	}

	@Configuration
	@Import({ RuleBasedPostureDetector.class, HybridPostureDetector.class, PostureDetectorRegistry.class })
	static class DetectorConfig {

		/** @Value 자리표시자를 풀어 준다. 실제 애플리케이션에서는 부트가 자동으로 등록한다. */
		@Bean
		static PropertySourcesPlaceholderConfigurer propertySourcesPlaceholderConfigurer() {
			return new PropertySourcesPlaceholderConfigurer();
		}

		/**
		 * 설정값 "4,8,12,16,20"을 double[]로 바꾸는 변환기. 부트 애플리케이션에서는 자동으로 등록되지만 여기서는 컨텍스트를
		 * 직접 조립하므로 넣어 줘야 한다.
		 */
		@Bean(name = ConfigurableApplicationContext.CONVERSION_SERVICE_BEAN_NAME)
		static ConversionService conversionService() {
			return ApplicationConversionService.getSharedInstance();
		}

		@Bean
		ObjectMapper objectMapper() {
			return new ObjectMapper();
		}
	}

	/** 델타 판정기까지 올린 구성. 위 DetectorConfig 에 넣지 않는 이유는 나머지 검증이 두 종 기준이기 때문이다. */
	@Configuration
	@Import({ RuleBasedPostureDetector.class, HybridPostureDetector.class, HybridDeltaPostureDetector.class,
			PostureDetectorRegistry.class })
	static class DeltaDetectorConfig extends DetectorConfig {
	}

	/** 모델만 다른 변형까지 전부 올린 구성. 실제 기동과 같은 판정기 구성이다. */
	@Configuration
	@Import({ RuleBasedPostureDetector.class, HybridPostureDetector.class, HybridDeltaPostureDetector.class,
			HybridVariantDetectorConfig.class, PostureDetectorRegistry.class })
	static class VariantDetectorConfig extends DetectorConfig {
	}
}
