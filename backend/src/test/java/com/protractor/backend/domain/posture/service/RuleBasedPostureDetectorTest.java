package com.protractor.backend.domain.posture.service;

import static org.assertj.core.api.Assertions.assertThat;

import com.protractor.backend.domain.posture.dto.PostureBaseline;
import com.protractor.backend.domain.posture.dto.PostureFeatures;
import com.protractor.backend.domain.posture.dto.PostureResult;
import com.protractor.backend.domain.posture.dto.PostureResult.Judgement;
import com.protractor.backend.domain.posture.entity.PostureType;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/**
 * 규칙 기반 판정기 검증. 임계값은 application.yml과 같은 값을 넣어 실제 동작과 맞춘다.
 *
 * <p>
 * 자세 3종이 서로 독립적으로 판정되는지, 그리고 믿을 수 없는 프레임을 정상으로 넘기지 않고 보류하는지를 확인한다.
 */
class RuleBasedPostureDetectorTest {

	private static final double MIN_VISIBILITY = 0.5;
	private static final double MAX_TORSO_ROTATION = 0.35;

	private final RuleBasedPostureDetector detector = new RuleBasedPostureDetector(MIN_VISIBILITY, MAX_TORSO_ROTATION,
			new double[] { 4, 8, 12, 16, 20 }, new double[] { 2, 4, 6, 8, 10 });

	/** 바른 자세일 때의 기준선. 귀-어깨 각도는 약 9.46도, 어깨너비/얼굴너비는 2.5다. */
	private final PostureBaseline baseline = new PostureBaseline("v1", 0.10, 0.60, 2.50, 0.00, 150);

	@Test
	@DisplayName("기준선과 같은 자세면 판정 대상 모두 정상이다")
	void allNormalWhenSameAsBaseline() {
		PostureResult result = detector.detect(features(f -> f), baseline);

		// 거북목·어깨 높낮이 2종. 라운드숄더는 판정 대상에서 빠졌다.
		assertThat(result.judgements()).hasSize(2)
				.allSatisfy(judgement -> assertThat(judgement.severity()).isZero());
	}

	@Test
	@DisplayName("귀가 앞으로 나오면 거북목만 잡히고 어깨는 영향받지 않는다")
	void detectsForwardHeadIndependently() {
		// 귀-어깨 각도가 9.46도 -> 26.57도로 벌어진다(편차 약 17.1도 = 심각도 4).
		PostureResult result = detector.detect(features(f -> f.withEarShoulderOffset(0.30)), baseline);

		assertThat(severityOf(result, PostureType.FORWARD_HEAD)).isEqualTo(4);
		assertThat(severityOf(result, PostureType.SHOULDER_TILT)).isZero();
	}

	@Test
	@DisplayName("어깨 폭이 크게 줄어도 아무 자세도 잡히지 않는다")
	void ignoresShoulderWidthChange() {
		// 예전에는 어깨 폭 -15%를 라운드숄더 심각도 4로 봤다. 사람마다 지표가 움직이는 방향이 반대라
		// 판정을 걷어냈고, 이제 이 지표는 어떤 자세도 만들지 않는다.
		PostureResult result = detector.detect(features(f -> f.withShoulderToFaceWidth(2.125)), baseline);

		assertThat(result.judgements()).allSatisfy(j -> assertThat(j.severity()).isZero());
	}

	@Test
	@DisplayName("좌우 어깨 높이가 틀어지면 어깨 높낮이로 잡힌다")
	void detectsShoulderTilt() {
		// atan(0.15) = 약 8.53도 -> 심각도 4.
		PostureResult result = detector.detect(features(f -> f.withShoulderTilt(0.15)), baseline);

		assertThat(severityOf(result, PostureType.SHOULDER_TILT)).isEqualTo(4);
	}

	@Test
	@DisplayName("나쁜 자세 2종이 동시에 잡힐 수 있다")
	void detectsMultiplePosturesAtOnce() {
		PostureResult result = detector
				.detect(features(f -> f.withEarShoulderOffset(0.30).withShoulderTilt(0.15)), baseline);

		assertThat(severityOf(result, PostureType.FORWARD_HEAD)).isEqualTo(4);
		assertThat(severityOf(result, PostureType.SHOULDER_TILT)).isEqualTo(4);
	}

	@Test
	@DisplayName("귀가 가려지면 거북목은 보류하고 어깨는 그대로 판정한다")
	void skipsForwardHeadWhenEarHidden() {
		PostureResult result = detector.detect(features(f -> f.withEarVisibility(0.2)), baseline);

		assertThat(judgementOf(result, PostureType.FORWARD_HEAD).skipReason()).isEqualTo("LOW_VISIBILITY");
		assertThat(severityOf(result, PostureType.SHOULDER_TILT)).isZero();
	}

	@Test
	@DisplayName("몸통이 크게 틀어지면 어깨 높낮이만 보류한다(거북목은 회전에 강하다)")
	void skipsShoulderJudgementsWhenTorsoRotated() {
		PostureResult result = detector.detect(features(f -> f.withTorsoRotation(0.50)), baseline);

		assertThat(judgementOf(result, PostureType.SHOULDER_TILT).skipReason()).isEqualTo("TORSO_ROTATED");
		assertThat(judgementOf(result, PostureType.FORWARD_HEAD).isEvaluated()).isTrue();
	}

	@Test
	@DisplayName("기준선이 없으면 정상으로 넘기지 않고 모두 보류한다")
	void skipsEverythingWithoutBaseline() {
		PostureResult result = detector.detect(features(f -> f), null);

		assertThat(result.judgements()).allSatisfy(judgement -> {
			assertThat(judgement.isEvaluated()).isFalse();
			assertThat(judgement.skipReason()).isEqualTo("NO_BASELINE");
		});
	}

	@Test
	@DisplayName("기준선보다 좋은 자세는 심각도가 음수가 되지 않는다")
	void betterThanBaselineIsNormal() {
		PostureResult result = detector.detect(features(f -> f.withEarShoulderOffset(0.02)), baseline);

		assertThat(severityOf(result, PostureType.FORWARD_HEAD)).isZero();
	}

	// ── 테스트 픽스처 ──

	private PostureFeatures features(java.util.function.UnaryOperator<Fixture> customizer) {
		return customizer.apply(new Fixture()).build();
	}

	private Judgement judgementOf(PostureResult result, PostureType type) {
		return result.judgements().stream().filter(j -> j.type() == type).findFirst().orElseThrow();
	}

	private Integer severityOf(PostureResult result, PostureType type) {
		return judgementOf(result, type).severity();
	}

	/** 기준선과 동일한 값에서 출발해 필요한 항목만 바꾸는 빌더. 무엇을 바꿨는지가 테스트에서 바로 보이게 한다. */
	private static final class Fixture {

		private double earShoulderOffset = 0.10;
		private double shoulderToFaceWidth = 2.50;
		private double shoulderTilt = 0.00;
		private double torsoRotation = 0.05;
		private double earVisibility = 0.95;

		private Fixture withEarShoulderOffset(double value) {
			this.earShoulderOffset = value;
			return this;
		}

		private Fixture withShoulderToFaceWidth(double value) {
			this.shoulderToFaceWidth = value;
			return this;
		}

		private Fixture withShoulderTilt(double value) {
			this.shoulderTilt = value;
			return this;
		}

		private Fixture withTorsoRotation(double value) {
			this.torsoRotation = value;
			return this;
		}

		private Fixture withEarVisibility(double value) {
			this.earVisibility = value;
			return this;
		}

		private PostureFeatures build() {
			return new PostureFeatures(1769472000000L, earShoulderOffset, 0.60, shoulderToFaceWidth, shoulderTilt,
					torsoRotation, 0.71, 0.43, earVisibility, 0.97);
		}
	}
}
