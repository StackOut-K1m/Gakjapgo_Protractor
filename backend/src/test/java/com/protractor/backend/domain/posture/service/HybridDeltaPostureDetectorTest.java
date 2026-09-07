package com.protractor.backend.domain.posture.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.assertj.core.api.Assertions.within;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.protractor.backend.domain.posture.dto.PostureBaseline;
import com.protractor.backend.domain.posture.dto.PostureFeatures;
import com.protractor.backend.domain.posture.dto.PostureMlFeatures;
import com.protractor.backend.domain.posture.dto.PostureResult;
import com.protractor.backend.domain.posture.dto.PostureResult.Judgement;
import com.protractor.backend.domain.posture.entity.PostureType;
import java.io.IOException;
import java.io.InputStream;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.core.io.ClassPathResource;
import org.springframework.core.io.DefaultResourceLoader;

/**
 * 개인 기준선 델타 판정기 검증.
 *
 * <p>
 * 하이브리드와 판정 흐름은 같으므로 여기서는 <b>델타 때문에 새로 생긴 것</b>만 본다.
 *
 * <ul>
 * <li>델타를 자바가 파이썬과 같은 값으로 만드는가 — 틀려도 예외는 안 나고 확률만 그럴듯하게 어긋난다
 * <li>절댓값을 차이에 취하는가, 차이를 절댓값에 취하는가 — 후자로 짜면 기울기가 뒤집힌 것을 정상으로 본다
 * <li>같은 프레임이라도 기준선이 다르면 판정이 달라지는가 — 이게 안 되면 델타를 넣은 의미가 없다
 * <li>ML 기준선이 없을 때 규칙 기반으로 흘려보내지 않고 보류하는가
 * </ul>
 */
class HybridDeltaPostureDetectorTest {

	/** application.yml의 app.posture.hybrid-delta.severity-probabilities와 같은 값. */
	private static final double[] SEVERITY_PROBABILITIES = { 0.50, 0.55, 0.70, 0.85, 0.95 };

	private final RuleBasedPostureDetector ruleBased = new RuleBasedPostureDetector(0.5, 0.35,
			new double[] { 4, 8, 12, 16, 20 }, new double[] { 2, 4, 6, 8, 10 });

	private LogisticPostureModel model;
	private HybridDeltaPostureDetector detector;

	@BeforeEach
	void setUp() throws IOException {
		// 서버가 실제로 싣고 다니는 파일 그대로 읽는다. 모델을 갈아 끼우면 이 테스트가 먼저 깨져야 한다.
		try (InputStream in = new ClassPathResource("models/turtleneck_delta_model.json").getInputStream()) {
			model = new ObjectMapper().readValue(in, LogisticPostureModel.class);
		}
		// 어깨 높낮이는 델타가 개선하지 못해 모델을 두지 않는다(설정도 하이브리드와 같은 파일을 가리킨다).
		// 여기서는 빈 경로로 두어 "모델 없는 자세는 규칙 기반이 남는다"까지 같이 확인한다.
		detector = new HybridDeltaPostureDetector(ruleBased, new DefaultResourceLoader(), new ObjectMapper(),
				"classpath:models/turtleneck_delta_model.json", "", SEVERITY_PROBABILITIES);
	}

	@Test
	@DisplayName("델타 모델은 기준선을 요구하고, 델타 피처의 원본 이름을 서버가 모두 알고 있다")
	void deltaModelRequiresBaselineAndSourcesAreKnown() {
		assertThat(model.requiresBaseline()).isTrue();
		// 델타 이름 자체는 PostureMlFeatures에 없다. 원본 이름을 보고 통과해야 한다.
		model.verifyFeaturesKnown("FORWARD_HEAD");

		assertThat(model.featureOrder()).hasSize(20).contains("d_ear_above_shoulder", "abs_d_shoulder_tilt_signed");
		assertThat(model.deltaFeatures()).contains("ear_above_shoulder", "shoulder_tilt_signed");
		assertThat(model.absDeltaFeatures()).containsExactly("shoulder_tilt_signed", "head_roll");
	}

	@Test
	@DisplayName("파이썬 추론과 같은 확률을 낸다")
	void probabilityMatchesPythonInference() {
		// 같은 (피처, 기준선) 쌍을 파이썬 추론식에 넣어 얻은 값이다. 델타를 만드는 규칙까지 포함해서 맞춘다.
		//
		// ⚠️ 모델 파일을 갈아 끼우면 이 값들은 반드시 바뀐다. 그때는 아래 픽스처를 그대로 파이썬에 넣어
		// 다시 받아 적어야 한다. 값을 맞추려고 오차를 느슨하게 풀면 이 테스트의 존재 이유가 사라진다.
		assertThat(model.probability(goodPosture(), goodPosture())).isEqualTo(1.5064319206121811e-05, within(1e-15));
		assertThat(model.probability(turtleNeck(), goodPosture())).isEqualTo(0.916633608943929, within(1e-12));
	}

	@Test
	@DisplayName("절댓값은 차이를 먼저 낸 뒤 취한다 — 기울기가 뒤집힌 것을 정상으로 보지 않는다")
	void absoluteIsTakenOnTheDifferenceNotTheOtherWayAround() {
		// tiltFlipped 는 기준선과 |기울기|가 같고 부호만 반대다.
		// |현재| - |기준선| 으로 계산했다면 델타가 0 이 되어 기준선 그대로인 프레임과 구별되지 않는다.
		double atBaseline = model.probability(goodPosture(), goodPosture());
		double flipped = model.probability(tiltFlipped(), goodPosture());

		assertThat(flipped).isNotEqualTo(atBaseline);
		assertThat(flipped).isEqualTo(3.087838885071871e-07, within(1e-17));
	}

	@Test
	@DisplayName("같은 프레임도 기준선이 다르면 심각도가 달라진다 — 델타를 넣은 이유다")
	void sameFrameJudgedDifferentlyPerBaseline() {
		PostureFeatures features = features(0.30, 0.00, 0.05, 0.95, turtleNeck());

		// 바른 자세가 goodPosture 인 사람에게는 확률 0.917 → 심각도 4.
		Judgement againstGood = judgementOf(detector.detect(features, baselineWith(goodPosture())),
				PostureType.FORWARD_HEAD);
		// 바른 자세가 이미 이 모양인 사람에게는 델타가 0 이지만, 원본 피처가 남아 있어 0.960 → 심각도 5.
		// 델타만 썼다면 여기서 "정상"이 나온다. 캘리브레이션이 나쁜 자세였을 때를 못 잡는다는 뜻이다.
		Judgement againstTurtle = judgementOf(detector.detect(features, baselineWith(turtleNeck())),
				PostureType.FORWARD_HEAD);

		assertThat(againstGood.severity()).isEqualTo(4);
		assertThat(againstTurtle.severity()).isEqualTo(5);
	}

	@Test
	@DisplayName("심각도는 델타 모델이 정하고, 이탈 각도는 규칙 기반 값을 그대로 남긴다")
	void modelDecidesSeverityWhileAngleStaysFromRules() {
		PostureFeatures features = features(0.30, 0.00, 0.05, 0.95, turtleNeck());

		Judgement rule = judgementOf(ruleBased.detect(features, baselineWith(goodPosture())), PostureType.FORWARD_HEAD);
		Judgement delta = judgementOf(detector.detect(features, baselineWith(goodPosture())), PostureType.FORWARD_HEAD);

		assertThat(delta.deviationDegrees()).isEqualByComparingTo(rule.deviationDegrees());
		assertThat(delta.deviationDegrees()).isEqualByComparingTo("17.10");
	}

	@Test
	@DisplayName("ML 기준선이 없으면 규칙 기반으로 흘리지 않고 보류한다")
	void skipsWhenMlBaselineIsMissing() {
		// hybrid-delta 가 생기기 전에 캘리브레이션한 회원. v1 기준선은 있고 ML 평균만 없다.
		PostureBaseline oldBaseline = new PostureBaseline("v1", 0.10, 0.60, 2.50, 0.00, 150);
		PostureFeatures features = features(0.30, 0.00, 0.05, 0.95, turtleNeck());

		Judgement delta = judgementOf(detector.detect(features, oldBaseline), PostureType.FORWARD_HEAD);

		// 규칙 기반은 이 프레임을 심각도 4로 본다. 그 값이 그대로 나오면 델타로 실험한 줄 알고
		// 규칙 기반 결과를 모으게 된다.
		assertThat(delta.isEvaluated()).isFalse();
		assertThat(delta.skipReason()).isEqualTo("NO_ML_BASELINE");
	}

	@Test
	@DisplayName("델타 모델이 없는 자세는 규칙 기반 판정이 그대로 남는다")
	void typesWithoutModelKeepRuleJudgement() {
		// 어깨가 8.53도 틀어진 프레임. 이 판정기에는 어깨 높낮이 모델을 싣지 않았다.
		PostureFeatures features = features(0.10, 0.15, 0.05, 0.95, turtleNeck());

		PostureResult delta = detector.detect(features, baselineWith(goodPosture()));
		PostureResult rule = ruleBased.detect(features, baselineWith(goodPosture()));

		assertThat(judgementOf(delta, PostureType.SHOULDER_TILT))
				.isEqualTo(judgementOf(rule, PostureType.SHOULDER_TILT));
	}

	@Test
	@DisplayName("기준선 없이 델타 모델을 호출하면 0으로 채우지 않고 실패한다")
	void modelRefusesToGuessMissingBaseline() {
		// 0 으로 채우면 델타가 0 = "바른 자세" 라, 나쁜 자세를 전부 정상으로 판정하게 된다.
		assertThatThrownBy(() -> model.probability(turtleNeck(), null)).isInstanceOf(IllegalStateException.class)
				.hasMessageContaining("기준선");
	}

	@Test
	@DisplayName("판정기 키와 이름이 하이브리드와 구분된다")
	void hasItsOwnKeyAndName() {
		assertThat(detector.key()).isEqualTo("hybrid-delta");
		assertThat(detector.name()).isEqualTo("hybrid-delta-logistic-v1");
		assertThat(detector.detect(features(0.30, 0.00, 0.05, 0.95, turtleNeck()), baselineWith(goodPosture()))
				.detectorName()).isEqualTo("hybrid-delta-logistic-v1");
	}

	// ── 테스트 픽스처 ──

	private Judgement judgementOf(PostureResult result, PostureType type) {
		return result.judgements().stream().filter(j -> j.type() == type).findFirst().orElseThrow();
	}

	private PostureBaseline baselineWith(PostureMlFeatures mlBaseline) {
		return new PostureBaseline("v1", 0.10, 0.60, 2.50, 0.00, 150, mlBaseline);
	}

	private PostureFeatures features(double earShoulderOffset, double shoulderTilt, double torsoRotation,
			double earVisibility, PostureMlFeatures ml) {
		return new PostureFeatures(1769472000000L, earShoulderOffset, 0.60, 2.50, shoulderTilt, torsoRotation, 0.71,
				0.43, earVisibility, 0.97, ml);
	}

	/** 바른 자세 피처. 기준선으로도 쓰고 프레임으로도 쓴다. */
	private PostureMlFeatures goodPosture() {
		return new PostureMlFeatures(0.19, 0.35, 0.62, 0.60, -1.40, -0.45, 0.75, 0.05, 0.02, 0.02, 0.05, 0.03);
	}

	/** 거북목 피처. 코가 내려오고(0.62→0.45) 귀가 앞으로 나온 상태다. */
	private PostureMlFeatures turtleNeck() {
		return new PostureMlFeatures(0.19, 0.35, 0.45, 0.62, -1.30, -0.30, 0.70, 0.05, 0.02, 0.02, 0.05, 0.03);
	}

	/** goodPosture 와 |어깨 기울기|는 같고 부호만 반대. 절댓값을 취하는 순서를 가르는 픽스처다. */
	private PostureMlFeatures tiltFlipped() {
		return new PostureMlFeatures(0.19, 0.35, 0.62, 0.60, -1.40, -0.45, 0.75, 0.05, -0.02, 0.02, 0.05, 0.03);
	}
}
