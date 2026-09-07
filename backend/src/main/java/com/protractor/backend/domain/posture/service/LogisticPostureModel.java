package com.protractor.backend.domain.posture.service;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;
import com.protractor.backend.domain.posture.dto.PostureMlFeatures;
import java.util.List;

/**
 * 학습해서 내보낸 로지스틱 회귀 모델 한 개. {@code ai/train.ipynb}의 {@code export_model()} 또는
 * {@code export_delta_model()}이 만든 JSON을 그대로 읽는다.
 *
 * <p>
 * ONNX Runtime을 쓰지 않는 이유는 담을 게 없어서다. 로지스틱 회귀는 표준화 계수와 가중치 벡터가 전부라, 그래프 실행 엔진을
 * 얹으면 수십 MB 의존성을 더하고도 하는 일은 아래 곱셈 열 번과 같다. 이미지 학습(방법 C)처럼 신경망을 올릴 때 ONNX를 들이면
 * 된다.
 *
 * <p>
 * 추론식은 학습 노트북·{@code ai/src/predict.py}와 <b>글자 그대로 같아야 한다</b>. 표준화를 빠뜨리거나 피처 순서가
 * 어긋나면 예외 없이 그럴듯하게 틀린 확률이 나오고, 그건 테스트 없이는 발견되지 않는다.
 *
 * <pre>
 * z    = intercept + Σ coef_i · (f_i - mean_i) / std_i
 * prob = 1 / (1 + exp(-z))
 * </pre>
 *
 * <p>
 * <b>델타 모델</b>({@code model_kind = "delta-v1"})은 피처 일부를 <b>캘리브레이션 기준선 대비 차이</b>로
 * 쓴다. 절대값만 보는 모델은 목이 원래 긴 사람을 바른 자세에서도 거북목으로 보는데, 그 체형차가 기준선이라는 상수 안에 들어 있어
 * 빼면 사라지기 때문이다. {@code feature_order}에 들어오는 이름은 학습 노트북이 만든 것과 같은 규칙이다.
 *
 * <pre>
 * d_&lt;src&gt;      = f[src] - baseline[src]        (delta_features 의 각 src)
 * abs_d_&lt;src&gt;  = |f[src] - baseline[src]|      (abs_delta_features 의 각 src)
 * </pre>
 *
 * <p>
 * 절댓값은 <b>차이를 먼저 내고</b> 취한다. {@code |f| - |baseline|}로 계산하면 원래 왼쪽으로 기운 사람이 같은 크기로
 * 오른쪽으로 기울었을 때 0이 나와, 기울기가 뒤집힌 것을 정상으로 본다. 규칙 기반이 쓰는 정의도
 * {@code abs(current - baseline)}이다.
 *
 * @param modelKind 모델 종류. {@code delta-v1}이면 기준선이 필요하다. 옛 모델에는 없어서 null로 들어온다
 * @param featureOrder 학습 때 쓴 피처 이름 순서. mean·std·coef가 이 순서에 대응한다
 * @param deltaFeatures 기준선과의 차이로 쓰는 원본 피처 이름. {@code d_} 접두사가 붙어 featureOrder에 들어 있다
 * @param absDeltaFeatures 차이의 절댓값으로 쓰는 원본 피처 이름. {@code abs_d_} 접두사가 붙는다
 * @param mean 학습 데이터의 피처별 평균(표준화용)
 * @param std 학습 데이터의 피처별 표준편차(표준화용)
 * @param coef 표준화된 피처에 곱하는 가중치
 * @param intercept 절편
 * @param threshold 학습 때 정한 O/X 기준 확률. 서버는 0~5 심각도를 쓰므로 참고용으로만 둔다
 */
@JsonIgnoreProperties(ignoreUnknown = true)
public record LogisticPostureModel(@JsonProperty("model_kind") String modelKind,
		@JsonProperty("feature_order") List<String> featureOrder,
		@JsonProperty("delta_features") List<String> deltaFeatures,
		@JsonProperty("abs_delta_features") List<String> absDeltaFeatures, double[] mean, double[] std, double[] coef,
		double intercept, double threshold) {

	/** 델타 피처 이름 접두사. 학습 노트북의 {@code DELTA_FEATURE_ORDER} 생성 규칙과 같아야 한다. */
	private static final String DELTA_PREFIX = "d_";
	private static final String ABS_DELTA_PREFIX = "abs_d_";

	/**
	 * 모델 파일이 그 자체로 온전한지 확인한다.
	 *
	 * <p>
	 * 길이가 어긋나거나 std가 0이면 계산은 되지만 결과가 조용히 망가진다. 잘못된 모델로 사용자에게 경고를 쏘는 것보다 기동에 실패하는
	 * 편이 낫다.
	 */
	public LogisticPostureModel {
		// 옛 모델 JSON에는 델타 관련 키가 아예 없다. null을 그대로 두면 requiresBaseline()부터 터진다.
		deltaFeatures = deltaFeatures == null ? List.of() : List.copyOf(deltaFeatures);
		absDeltaFeatures = absDeltaFeatures == null ? List.of() : List.copyOf(absDeltaFeatures);

		if (featureOrder == null || featureOrder.isEmpty()) {
			throw new IllegalArgumentException("모델에 feature_order가 없습니다.");
		}
		int n = featureOrder.size();
		if (mean == null || std == null || coef == null || mean.length != n || std.length != n || coef.length != n) {
			throw new IllegalArgumentException(
					"모델의 mean/std/coef 길이가 feature_order(%d)와 다릅니다.".formatted(n));
		}
		for (int i = 0; i < n; i++) {
			if (std[i] == 0.0) {
				throw new IllegalArgumentException("표준편차가 0인 피처가 있어 표준화할 수 없습니다: " + featureOrder.get(i));
			}
		}

		// 델타 목록에 적어 놓고 feature_order에는 안 넣으면 그 피처는 계산에 쓰이지 않는다.
		// 확률이 그럴듯하게 틀리기만 하므로 기동에서 잡는다.
		for (String source : deltaFeatures) {
			if (!featureOrder.contains(DELTA_PREFIX + source)) {
				throw new IllegalArgumentException(
						"delta_features에 '%s'가 있는데 feature_order에 '%s'가 없습니다.".formatted(source,
								DELTA_PREFIX + source));
			}
		}
		for (String source : absDeltaFeatures) {
			if (!featureOrder.contains(ABS_DELTA_PREFIX + source)) {
				throw new IllegalArgumentException(
						"abs_delta_features에 '%s'가 있는데 feature_order에 '%s'가 없습니다.".formatted(source,
								ABS_DELTA_PREFIX + source));
			}
		}
	}

	/**
	 * 이 모델이 캘리브레이션 기준선 없이는 확률을 낼 수 없는지.
	 *
	 * <p>
	 * 기준선이 없을 때 조용히 0으로 채워 계산하면 안 된다. 델타 0은 "바른 자세"라는 뜻이라, 나쁜 자세를 전부 정상으로 판정하게 된다.
	 */
	public boolean requiresBaseline() {
		return !deltaFeatures.isEmpty() || !absDeltaFeatures.isEmpty();
	}

	/**
	 * 이 모델이 요구하는 피처를 서버가 전부 알고 있는지 확인한다. 기동 시 한 번 부른다.
	 *
	 * <p>
	 * 모델을 다시 학습하면서 피처를 추가했는데 {@link PostureMlFeatures}에 필드를 안 만들면, 그 피처는 매 프레임 null이
	 * 된다. 이걸 런타임에 만나면 판정이 통째로 죽으므로 기동 때 걸러낸다.
	 *
	 * <p>
	 * 델타 피처는 이름 자체가 {@link PostureMlFeatures}에 없다. 브라우저가 보내는 값이 아니라 서버가 기준선과 빼서 만드는
	 * 값이기 때문이다. 그래서 <b>원본 피처 이름</b>이 있는지를 대신 본다.
	 */
	public void verifyFeaturesKnown(String modelName) {
		PostureMlFeatures probe = new PostureMlFeatures(0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0);
		for (String feature : featureOrder) {
			String source = sourceOf(feature);
			if (probe.valueOf(source) == null) {
				throw new IllegalStateException(
						"%s 모델이 요구하는 피처 '%s'를 PostureMlFeatures가 갖고 있지 않습니다. 필드를 추가하고 브라우저 추출 코드도 함께 고치세요."
								.formatted(modelName, source.equals(feature) ? feature
										: "%s (델타의 원본 피처 %s)".formatted(feature, source)));
			}
		}
	}

	/**
	 * 피처 한 세트에 대한 확률(0~1)을 낸다. 기준선이 필요 없는 모델 전용이다.
	 *
	 * @param features 브라우저가 보낸 ML 피처 블록
	 * @return 이 자세일 확률
	 */
	public double probability(PostureMlFeatures features) {
		return probability(features, null);
	}

	/**
	 * 피처 한 세트에 대한 확률(0~1)을 낸다.
	 *
	 * @param features 브라우저가 보낸 ML 피처 블록
	 * @param baseline 캘리브레이션 기준선의 ML 피처 평균. 델타 모델이 아니면 무시되며 null이어도 된다
	 * @return 이 자세일 확률
	 */
	public double probability(PostureMlFeatures features, PostureMlFeatures baseline) {
		if (requiresBaseline() && baseline == null) {
			// 호출부(HybridPostureDetector)가 먼저 걸러야 한다. 여기까지 왔다면 그쪽이 빠뜨린 것이다.
			throw new IllegalStateException("델타 모델인데 캘리브레이션 기준선이 없습니다. requiresBaseline()을 먼저 확인하세요.");
		}
		double z = intercept;
		for (int i = 0; i < featureOrder.size(); i++) {
			z += coef[i] * (valueOf(featureOrder.get(i), features, baseline) - mean[i]) / std[i];
		}
		return 1.0 / (1.0 + Math.exp(-z));
	}

	/**
	 * 피처 이름 하나에 해당하는 값. 델타 이름이면 기준선과의 차이를 만들어 돌려준다.
	 *
	 * <p>
	 * 접두사 문자열로 판정하지 않고 {@code delta_features} 목록을 뒤지는 이유는, 원본 피처 이름이 우연히
	 * {@code d_}로 시작할 때 델타로 오인하는 것을 막기 위해서다.
	 */
	private double valueOf(String feature, PostureMlFeatures features, PostureMlFeatures baseline) {
		for (String source : absDeltaFeatures) {
			if (feature.equals(ABS_DELTA_PREFIX + source)) {
				return Math.abs(features.valueOf(source) - baseline.valueOf(source));
			}
		}
		for (String source : deltaFeatures) {
			if (feature.equals(DELTA_PREFIX + source)) {
				return features.valueOf(source) - baseline.valueOf(source);
			}
		}
		// 기동 시 verifyFeaturesKnown으로 걸렀고, DTO가 모든 필드를 @NotNull로 받으므로 여기 오면 값이 있다.
		return features.valueOf(feature);
	}

	/** 델타 피처면 그 원본 피처 이름을, 아니면 자기 자신을 돌려준다. */
	private String sourceOf(String feature) {
		for (String source : absDeltaFeatures) {
			if (feature.equals(ABS_DELTA_PREFIX + source)) {
				return source;
			}
		}
		for (String source : deltaFeatures) {
			if (feature.equals(DELTA_PREFIX + source)) {
				return source;
			}
		}
		return feature;
	}
}
