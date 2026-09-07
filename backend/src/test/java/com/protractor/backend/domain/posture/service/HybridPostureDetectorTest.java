package com.protractor.backend.domain.posture.service;

import static org.assertj.core.api.Assertions.assertThat;
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
import java.util.EnumMap;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.core.io.ClassPathResource;

/**
 * 하이브리드 판정기 검증.
 *
 * <p>
 * 확인할 것이 둘이다. 하나는 <b>자바 추론이 파이썬 학습·검증과 같은 확률을 내는지</b>다. 표준화를 빠뜨리거나 피처 순서가 어긋나도
 * 예외는 나지 않고 그럴듯하게 틀린 확률만 나오므로, 파이썬에서 미리 계산한 값을 박아 두고 맞춰 본다(기대값 출처는 각 테스트 주석 참고).
 *
 * <p>
 * 다른 하나는 <b>규칙 기반과의 역할 분담</b>이다. 심각도만 모델이 정하고 이탈 각도·보류 판단은 규칙 기반 것을 그대로 써야 두 방식을
 * 같은 조건에서 비교할 수 있다.
 */
class HybridPostureDetectorTest {

	/** application.yml의 app.posture.hybrid.severity-probabilities와 같은 값. */
	private static final double[] SEVERITY_PROBABILITIES = { 0.50, 0.55, 0.70, 0.85, 0.95 };

	/**
	 * 첫 경계를 0.50으로 올리기 전의 값. 심각도 매핑 자체를 확인하는 테스트에서만 쓴다.
	 *
	 * <p>
	 * 픽스처의 거북목 프레임은 확률이 0.482라, 운영 경계에서는 심각도 0이 되어 "규칙이 정상이라고 본 프레임을 모델이 올린다"는 기제를
	 * 보여 줄 수 없다. 기제는 이 값으로 확인하고, 운영 경계에서 그 프레임이 어떻게 되는지는 따로 못박는다.
	 */
	private static final double[] LOWERED_PROBABILITIES = { 0.40, 0.55, 0.70, 0.85, 0.95 };

	private final RuleBasedPostureDetector ruleBased = new RuleBasedPostureDetector(0.5, 0.35,
			new double[] { 4, 8, 12, 16, 20 }, new double[] { 2, 4, 6, 8, 10 });

	private final PostureBaseline baseline = new PostureBaseline("v1", 0.10, 0.60, 2.50, 0.00, 150);

	private LogisticPostureModel model;
	private Map<PostureType, LogisticPostureModel> models;
	private HybridPostureDetector detector;

	@BeforeEach
	void setUp() throws IOException {
		// 서버가 실제로 싣고 다니는 파일 그대로 읽는다. 모델을 갈아 끼우면 이 테스트가 먼저 깨져야 한다.
		try (InputStream in = new ClassPathResource("models/turtleneck_model.json").getInputStream()) {
			model = new ObjectMapper().readValue(in, LogisticPostureModel.class);
		}
		models = new EnumMap<>(PostureType.class);
		models.put(PostureType.FORWARD_HEAD, model);
		detector = new HybridPostureDetector(ruleBased, models, SEVERITY_PROBABILITIES);
	}

	@Test
	@DisplayName("모델 파일의 피처를 서버가 모두 알고 있다")
	void modelFeaturesAreAllKnown() {
		model.verifyFeaturesKnown("FORWARD_HEAD");

		// shoulder_tilt_signed: 라벨 이름과 겹쳐 값이 덮어써지던 문제를 고치면서 이름이 바뀌었다.
		// shoulder_z_rel: 클라이언트가 보내지 않고 nose_z_rel 의 부호를 뒤집어 만든다(PostureMlFeatures 참고).
		assertThat(model.featureOrder()).containsExactly("eye_dist_ratio", "ear_dist_ratio", "nose_above_shoulder",
				"ear_above_shoulder", "nose_z_rel", "ear_z_rel", "acromion_proxy", "head_roll", "shoulder_tilt_signed",
				"abs_shoulder_tilt", "abs_head_roll", "shoulder_z_rel", "shoulder_z_spread");
	}

	@Test
	@DisplayName("피처가 전부 학습 평균이면 확률은 sigmoid(intercept)가 된다")
	void probabilityAtMeanIsSigmoidOfIntercept() {
		// 표준화 항이 모두 0이 되므로 z = intercept 다. 표준화를 빠뜨렸다면 여기서 어긋난다.
		double expected = 1.0 / (1.0 + Math.exp(-model.intercept()));

		assertThat(model.probability(atTrainingMean())).isEqualTo(expected, within(1e-12));
	}

	@Test
	@DisplayName("파이썬 추론과 같은 확률을 낸다")
	void probabilityMatchesPythonInference() {
		// 같은 피처 값을 파이썬 쪽 추론식에 넣어 얻은 결과다(ai/src/model_compare_test.py 의 probability
		// 와 같은 수식이며, backend LogisticPostureModel.probability() 도 같아야 한다).
		//
		// ⚠️ 모델 파일을 갈아 끼우면 이 값은 반드시 바뀐다. 그때는 goodPosture()·turtleNeck() 을
		// 그대로 파이썬에 넣어 다시 받아 적어야 한다. 값을 맞추려고 assertThat 을 느슨하게 풀면
		// 이 테스트의 존재 이유가 사라진다 — 표준화 누락과 피처 순서 어긋남은 예외 없이
		// "그럴듯하게 틀린 확률"로만 나타난다.
		//
		// 옛 모델(라벨 누수본)에서는 각각 0.00044 / 0.99999 였다. 지금 모델은 확률이 극단으로
		// 쏠리지 않는다 — 누수 때문에 라벨을 그대로 읽던 피처가 없어져서다.
		assertThat(model.probability(goodPosture())).isEqualTo(0.17481258182318027, within(1e-12));
		assertThat(model.probability(turtleNeck())).isEqualTo(0.4820729300307495, within(1e-12));
	}

	@Test
	@DisplayName("거북목 심각도는 모델이 정하고, 이탈 각도는 규칙 기반 값을 그대로 남긴다")
	void modelDecidesSeverityWhileAngleStaysFromRules() {
		// 기하로만 보면 귀-어깨 각도가 17.10도 벌어져 규칙 기반은 심각도 4를 준다.
		PostureFeatures features = features(0.30, 0.00, 0.05, 0.95, goodPosture());

		Judgement rule = judgementOf(ruleBased.detect(features, baseline), PostureType.FORWARD_HEAD);
		Judgement hybrid = judgementOf(detector.detect(features, baseline), PostureType.FORWARD_HEAD);

		assertThat(rule.severity()).isEqualTo(4);
		// 모델은 같은 프레임을 바른 자세(확률 0.175 — 첫 경계 0.50 미만)로 본다. 심각도만 갈린다.
		assertThat(hybrid.severity()).isZero();
		assertThat(hybrid.deviationDegrees()).isEqualByComparingTo(rule.deviationDegrees());
		assertThat(hybrid.deviationDegrees()).isEqualByComparingTo("17.10");
	}

	@Test
	@DisplayName("규칙 기반이 정상이라고 본 프레임도 모델이 나쁘다고 하면 심각도가 올라간다")
	void modelCanRaiseSeverityOnFrameRulesCallNormal() {
		// 기준선과 동일한 기하 → 규칙 기반 심각도 0, 이탈 각도 0.00.
		PostureFeatures features = features(0.10, 0.00, 0.05, 0.95, turtleNeck());

		// 확률 0.482. 경계를 옮기기 전 값으로 판정해 기제만 확인한다 — 운영 경계에서의 결과는 다음 테스트가 맡는다.
		HybridPostureDetector lowered = new HybridPostureDetector(ruleBased, models, LOWERED_PROBABILITIES);
		Judgement hybrid = judgementOf(lowered.detect(features, baseline), PostureType.FORWARD_HEAD);

		// 옛 모델(라벨 누수본)에서는 0.99999 로 심각도 5까지 갔다. 이 테스트가 확인하려는 것은
		// "규칙이 0이라고 본 프레임을 모델이 올릴 수 있다"이고 그건 심각도 1로도 성립한다.
		assertThat(hybrid.severity()).isEqualTo(1);
		assertThat(hybrid.deviationDegrees()).isEqualByComparingTo("0.00");
	}

	@Test
	@DisplayName("확률 0.482인 거북목 프레임은 운영 경계(0.50)에서 경고까지 가지 않는다")
	void borderlineFrameStaysBelowAlertThreshold() {
		// 위 테스트와 같은 프레임이다. 첫 경계를 0.40 에서 0.50 으로 올리면서 생긴 결과를 못박아 둔다.
		//
		// 이 프레임은 학습 데이터에서 거북목으로 라벨된 자세인데, 확률이 0.482 라 이제 심각도 0 —
		// 알림 기준(alert-severity: 1)에 닿지 않아 30초를 유지해도 경고가 뜨지 않는다.
		// 경계를 0.50 으로 올린 대가가 정확히 이것이고, 유저 테스트에서 "경고가 안 뜬다"는 말이
		// 나오면 원인은 모델이 아니라 이 줄이다. 되돌리려면 application.yml 의 첫 경계를 낮춘다.
		PostureFeatures features = features(0.10, 0.00, 0.05, 0.95, turtleNeck());

		Judgement hybrid = judgementOf(detector.detect(features, baseline), PostureType.FORWARD_HEAD);

		assertThat(model.probability(turtleNeck())).isEqualTo(0.482, within(0.001));
		assertThat(hybrid.severity()).isZero();
	}

	@Test
	@DisplayName("학습 모델이 없는 자세는 규칙 기반 판정을 그대로 쓴다")
	void typesWithoutModelKeepRuleJudgement() {
		// 어깨가 8.53도 틀어진 프레임. 어깨 높낮이 모델은 아직 없다.
		PostureFeatures features = features(0.10, 0.15, 0.05, 0.95, turtleNeck());

		PostureResult hybrid = detector.detect(features, baseline);
		PostureResult rule = ruleBased.detect(features, baseline);

		assertThat(judgementOf(hybrid, PostureType.SHOULDER_TILT))
				.isEqualTo(judgementOf(rule, PostureType.SHOULDER_TILT));
		assertThat(judgementOf(hybrid, PostureType.SHOULDER_TILT).severity()).isEqualTo(4);
	}

	@Test
	@DisplayName("ML 피처 블록이 없으면 3종 모두 규칙 기반으로 판정한다")
	void fallsBackToRulesWithoutMlFeatures() {
		PostureFeatures features = features(0.30, 0.00, 0.05, 0.95, null);

		PostureResult hybrid = detector.detect(features, baseline);

		assertThat(hybrid.judgements()).isEqualTo(ruleBased.detect(features, baseline).judgements());
		assertThat(judgementOf(hybrid, PostureType.FORWARD_HEAD).severity()).isEqualTo(4);
	}

	@Test
	@DisplayName("규칙 기반이 보류한 프레임은 모델에 넣지 않는다")
	void skippedFramesAreNotHandedToModel() {
		// 귀가 가려진 프레임. 피처를 믿을 수 없으니 모델이 확률을 내도 근거가 없다.
		PostureFeatures features = features(0.30, 0.00, 0.05, 0.20, turtleNeck());

		Judgement hybrid = judgementOf(detector.detect(features, baseline), PostureType.FORWARD_HEAD);

		assertThat(hybrid.isEvaluated()).isFalse();
		assertThat(hybrid.skipReason()).isEqualTo("LOW_VISIBILITY");
	}

	@Test
	@DisplayName("기준선이 없으면 규칙 기반과 똑같이 3종 모두 보류한다")
	void skipsEverythingWithoutBaseline() {
		PostureResult hybrid = detector.detect(features(0.30, 0.00, 0.05, 0.95, turtleNeck()), null);

		assertThat(hybrid.judgements())
				.allSatisfy(judgement -> assertThat(judgement.skipReason()).isEqualTo("NO_BASELINE"));
	}

	@Test
	@DisplayName("판정기 이름이 하이브리드로 남아 이벤트에서 방식을 구분할 수 있다")
	void reportsHybridName() {
		PostureResult hybrid = detector.detect(features(0.30, 0.00, 0.05, 0.95, turtleNeck()), baseline);

		assertThat(detector.name()).isEqualTo("hybrid-logistic-v1");
		assertThat(hybrid.detectorName()).isEqualTo("hybrid-logistic-v1");
	}

	// ── 테스트 픽스처 ──

	private Judgement judgementOf(PostureResult result, PostureType type) {
		return result.judgements().stream().filter(j -> j.type() == type).findFirst().orElseThrow();
	}

	/** v1 피처는 규칙 기반 테스트와 같은 기준선 값에서 출발하고, 필요한 것만 인자로 바꾼다. */
	private PostureFeatures features(double earShoulderOffset, double shoulderTilt, double torsoRotation,
			double earVisibility, PostureMlFeatures ml) {
		return new PostureFeatures(1769472000000L, earShoulderOffset, 0.60, 2.50, shoulderTilt, torsoRotation, 0.71,
				0.43, earVisibility, 0.97, ml);
	}

	/** 학습 데이터 평균과 정확히 같은 피처. 표준화 항이 0이 된다. */
	private PostureMlFeatures atTrainingMean() {
		// 레코드 필드 위치가 아니라 모델의 feature_order 이름으로 꺼낸다. 지금은 둘의 순서가 같지만,
		// 위치로 맞춰 두면 다음 재학습에서 순서가 바뀌었을 때 예외 없이 엉뚱한 값으로 조용히 통과한다.
		return new PostureMlFeatures(mean("eye_dist_ratio"), mean("ear_dist_ratio"), mean("nose_above_shoulder"),
				mean("ear_above_shoulder"), mean("nose_z_rel"), mean("ear_z_rel"), mean("acromion_proxy"),
				mean("head_roll"), mean("shoulder_tilt_signed"), mean("abs_shoulder_tilt"), mean("abs_head_roll"),
				mean("shoulder_z_spread"));
	}

	private double mean(String feature) {
		int index = model.featureOrder().indexOf(feature);
		if (index < 0) {
			throw new IllegalStateException("모델에 '%s' 피처가 없습니다. 재학습하면서 빠졌는지 확인하세요.".formatted(feature));
		}
		return model.mean()[index];
	}

	/**
	 * 모델이 바른 자세로 보는 피처.
	 *
	 * <p>
	 * 뒤 3개는 앞 값에서 나온다 — {@code abs_shoulder_tilt=|0.02|},
	 * {@code abs_head_roll=|0.05|}. 어깨 깊이 차는 정면을 본 상태라 작게 둔다.
	 */
	private PostureMlFeatures goodPosture() {
		return new PostureMlFeatures(0.19, 0.35, 0.62, 0.60, -1.40, -0.45, 0.75, 0.05, 0.02, 0.02, 0.05, 0.03);
	}

	/** 모델이 거북목으로 보는 피처. 코가 내려오고(0.62→0.45) 귀가 앞으로 나온 상태다. */
	private PostureMlFeatures turtleNeck() {
		return new PostureMlFeatures(0.19, 0.35, 0.45, 0.62, -1.30, -0.30, 0.70, 0.05, 0.02, 0.02, 0.05, 0.03);
	}
}
