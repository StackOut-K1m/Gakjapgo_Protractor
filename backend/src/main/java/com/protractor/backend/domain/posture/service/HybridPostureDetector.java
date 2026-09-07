package com.protractor.backend.domain.posture.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.protractor.backend.domain.posture.dto.PostureBaseline;
import com.protractor.backend.domain.posture.dto.PostureFeatures;
import com.protractor.backend.domain.posture.dto.PostureMlFeatures;
import com.protractor.backend.domain.posture.dto.PostureResult;
import com.protractor.backend.domain.posture.dto.PostureResult.Judgement;
import com.protractor.backend.domain.posture.entity.PostureType;
import java.io.IOException;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.EnumMap;
import java.util.List;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.core.io.Resource;
import org.springframework.core.io.ResourceLoader;
import org.springframework.stereotype.Service;

/**
 * 하이브리드 자세 판정기(방법 B). 브라우저가 뽑은 피처를 학습된 로지스틱 회귀에 넣어 판정한다.
 *
 * <p>
 * 사람이 자세를 취한 영상에서 <b>가중치를 학습해</b> 판단한다. 정면 웹캠에서는 실제 각도를 잴 수 없어서 규칙이 근사에 기댈 수밖에
 * 없는데, 학습 모델은 그 근사 대신 눈 간격·깊이(z)처럼 사람이 공식으로 엮기 어려운 신호까지 같이 본다.
 *
 * <p>
 * <b>규칙 기반을 먼저 돌리고 심각도만 갈아 끼운다.</b> 이유는 셋이다.
 *
 * <ul>
 * <li>{@code events.deviation_degrees}는 각도 컬럼이다. 확률(0~1)을 넣으면 단위가 깨져서 방법 A와 맞대볼 수
 * 없다. 그래서 각도는 규칙 기반이 계산한 값을 그대로 쓰고 심각도만 모델이 정한다
 * <li>보류 조건(가시성 부족·몸통 회전·기준선 없음)이 두 방식에서 같아야 <b>같은 프레임 집합</b>으로 정확도를 비교할 수 있다
 * <li>아직 학습하지 않은 자세는 자동으로 규칙 기반 결과가 남는다. 모델을 하나씩 추가해도 코드를 고칠 필요가 없다
 * </ul>
 *
 * <p>
 * 이 판정기는 항상 등록되고, 어느 것을 쓸지는 요청마다 {@link PostureDetectorRegistry}가 고른다.
 * {@code app.posture.hybrid.enabled=false}로 두면 아예 등록하지 않는다 — 모델 파일이 깨져 기동이 막힐 때 쓰는
 * 비상 스위치다.
 *
 * <p>
 * <b>키·이름을 상수가 아니라 필드로 들고 있는 이유</b>는 {@link HybridDeltaPostureDetector}가 이 클래스를 그대로
 * 물려받아 모델만 바꿔 끼우기 때문이다. 두 판정기의 차이는 어떤 모델 파일을 싣느냐뿐이라, 판정 흐름을 복사하면 한쪽만 고치는 사고가 난다.
 */
@Service
@ConditionalOnProperty(name = "app.posture.hybrid.enabled", havingValue = "true", matchIfMissing = true)
public class HybridPostureDetector implements PostureDetector {

	private static final Logger log = LoggerFactory.getLogger(HybridPostureDetector.class);

	/** API·설정에서 쓰는 키. 판정 버전이 올라가도 이 값은 그대로 둔다. */
	static final String KEY = "hybrid";

	private static final String NAME = "hybrid-logistic-v1";

	private static final String DESCRIPTION = "규칙 기반으로 각도와 보류를 정하고, 심각도만 학습된 로지스틱 회귀가 정한다.";

	private final String key;
	private final String name;
	private final String description;
	private final RuleBasedPostureDetector ruleBased;
	private final Map<PostureType, LogisticPostureModel> models;
	private final double[] severityProbabilities;

	/**
	 * 학습된 모델을 읽어 자세별로 물려 둔다. 경로가 비어 있는 자세는 모델 없이 두고 규칙 기반 결과를 그대로 쓴다.
	 *
	 * <p>
	 * 생성자가 여럿이라 {@code @Autowired}로 주입할 쪽을 짚어 준다. 없으면 스프링이 고르지 못해 기동에 실패한다.
	 */
	@Autowired
	public HybridPostureDetector(RuleBasedPostureDetector ruleBased, ResourceLoader resourceLoader,
			ObjectMapper objectMapper,
			@Value("${app.posture.hybrid.forward-head-model:}") String forwardHeadModel,
			@Value("${app.posture.hybrid.shoulder-tilt-model:}") String shoulderTiltModel,
			@Value("${app.posture.hybrid.severity-probabilities}") double[] severityProbabilities) {
		this(KEY, NAME, DESCRIPTION, ruleBased, severityProbabilities,
				loadModels(KEY, resourceLoader, objectMapper, forwardHeadModel, shoulderTiltModel));
	}

	/** 하위 판정기용. 모델 구성만 다르고 판정 흐름은 같다. */
	protected HybridPostureDetector(String key, String name, String description, RuleBasedPostureDetector ruleBased,
			double[] severityProbabilities, Map<PostureType, LogisticPostureModel> models) {
		this.key = key;
		this.name = name;
		this.description = description;
		this.ruleBased = ruleBased;
		this.severityProbabilities = severityProbabilities;
		this.models = models;
	}

	/** 테스트용. 모델 파일 로딩 없이 판정 로직만 검증한다. */
	HybridPostureDetector(RuleBasedPostureDetector ruleBased, Map<PostureType, LogisticPostureModel> models,
			double[] severityProbabilities) {
		this(KEY, NAME, DESCRIPTION, ruleBased, severityProbabilities, models);
	}

	/**
	 * 설정에 적힌 모델 파일을 자세별로 읽는다.
	 *
	 * <p>
	 * 경로를 지정했는데 읽지 못하면 기동에 실패시킨다. 조용히 규칙 기반으로 흘러가면 하이브리드로 돌린 줄 알고 며칠치 실험 데이터를 버리게
	 * 된다.
	 *
	 * <p>
	 * 라운드숄더 모델은 싣지 않는다. 규칙 기반이 그 자세를 아예 판정하지 않으므로 쓸 자리가 없다.
	 */
	protected static Map<PostureType, LogisticPostureModel> loadModels(String detectorKey, ResourceLoader resourceLoader,
			ObjectMapper objectMapper, String forwardHeadModel, String shoulderTiltModel) {
		Map<PostureType, LogisticPostureModel> models = new EnumMap<>(PostureType.class);
		load(models, PostureType.FORWARD_HEAD, forwardHeadModel, resourceLoader, objectMapper);
		load(models, PostureType.SHOULDER_TILT, shoulderTiltModel, resourceLoader, objectMapper);

		if (models.isEmpty()) {
			throw new IllegalStateException(
					"'%s' 판정기를 등록했는데 학습된 모델이 하나도 없습니다. app.posture.%s.*-model 경로를 지정하거나 app.posture.%s.enabled=false로 두세요."
							.formatted(detectorKey, detectorKey, detectorKey));
		}
		return models;
	}

	private static void load(Map<PostureType, LogisticPostureModel> models, PostureType type, String location,
			ResourceLoader resourceLoader, ObjectMapper objectMapper) {
		if (location == null || location.isBlank()) {
			log.info("{} 학습 모델이 지정되지 않아 규칙 기반으로 판정합니다.", type);
			return;
		}
		Resource resource = resourceLoader.getResource(location);
		try (InputStream in = resource.getInputStream()) {
			LogisticPostureModel model = objectMapper.readValue(in, LogisticPostureModel.class);
			model.verifyFeaturesKnown(type.name());
			models.put(type, model);
			log.info("{} 학습 모델을 불러왔습니다: {} (피처 {}개, 기준선 {})", type, location, model.featureOrder().size(),
					model.requiresBaseline() ? "필요" : "불필요");
		} catch (IOException e) {
			throw new IllegalStateException("%s 학습 모델을 읽지 못했습니다: %s".formatted(type, location), e);
		}
	}

	@Override
	public String key() {
		return key;
	}

	@Override
	public String description() {
		return description;
	}

	@Override
	public String name() {
		return name;
	}

	@Override
	public PostureResult detect(PostureFeatures features, PostureBaseline baseline) {
		List<Judgement> ruleJudgements = ruleBased.detect(features, baseline).judgements();

		PostureMlFeatures ml = features.mlFeatures();
		if (ml == null) {
			// 예전 클라이언트이거나 랜드마크가 모자라 블록을 못 채운 프레임이다. 규칙 기반 결과를 그대로 쓴다.
			return new PostureResult(name, ruleJudgements);
		}

		// 규칙 기반이 기준선 없음을 이미 걸러 주지만, 그건 v1 필드만 본 것이다. 델타 모델이 필요로 하는
		// ML 기준선은 예전에 캘리브레이션한 회원에게는 없을 수 있어 따로 확인한다.
		PostureMlFeatures mlBaseline = baseline == null ? null : baseline.mlBaseline();

		List<Judgement> judgements = new ArrayList<>(ruleJudgements.size());
		for (Judgement ruleJudgement : ruleJudgements) {
			judgements.add(withModelSeverity(ruleJudgement, ml, mlBaseline));
		}
		return new PostureResult(name, judgements);
	}

	/**
	 * 기준선 없이 이 프레임만 판정한다(입장 준비화면).
	 *
	 * <p>
	 * 이 판정기가 재정의할 수 있는 이유는 <b>모델이 기준선을 쓰지 않기</b> 때문이다. 배포된 모델은 절대값 피처로 학습돼 있어서
	 * (feature_mode 가 delta 가 아니다) 확률을 내는 데 개인 기준선이 필요하지 않다. 거북목 모델의 계수 1위가 ear_z_rel,
	 * 4위가 nose_z_rel 인 것에서 보듯 머리의 깊이로 판단하므로, 정면 웹캠에서도 목이 앞으로 나온 것을 잡는다.
	 *
	 * <p>
	 * 기준선이 필요한 것은 둘뿐이라 여기서는 건너뛴다 — 이탈 각도(기준선 대비로만 뜻이 있다)와 규칙 기반의 NO_BASELINE 보류.
	 * 프레임을 믿을 수 있는지 보는 사전 검사(가려짐·몸통 회전)는 기준선이 필요 없어 그대로 쓴다.
	 */
	@Override
	public PostureResult preview(PostureFeatures features) {
		PostureMlFeatures ml = features.mlFeatures();
		List<Judgement> judgements = new ArrayList<>(2);
		for (PostureType type : List.of(PostureType.FORWARD_HEAD, PostureType.SHOULDER_TILT)) {
			Judgement blocked = ruleBased.screen(features, type);
			if (blocked != null) {
				judgements.add(blocked);
				continue;
			}
			LogisticPostureModel model = models.get(type);
			if (ml == null || model == null) {
				// 옛 클라이언트이거나 그 자세에 모델을 물리지 않은 설정이다. 없는 판정을 지어내지 않는다.
				judgements.add(Judgement.skipped(type, "NO_MODEL"));
				continue;
			}
			int severity = toSeverity(model.probability(ml));
			judgements.add(severity == 0 ? Judgement.normal(type, null) : Judgement.detected(type, severity, null));
		}
		return new PostureResult(NAME, judgements);
	}

	/**
	 * 규칙 기반 판정의 심각도만 모델이 낸 확률로 바꾼다. 이탈 각도는 그대로 둔다.
	 *
	 * <p>
	 * 보류된 판정은 건드리지 않는다. 랜드마크가 가려졌거나 몸통이 틀어진 프레임은 피처 자체를 믿을 수 없어서, 모델에 넣으면 확률만 그럴듯하게
	 * 나오고 근거는 없다. 규칙 기반과 같은 프레임을 버려야 두 방식의 정확도를 같은 조건에서 비교할 수 있다는 이유도 있다.
	 */
	private Judgement withModelSeverity(Judgement ruleJudgement, PostureMlFeatures ml, PostureMlFeatures mlBaseline) {
		LogisticPostureModel model = models.get(ruleJudgement.type());
		if (model == null || !ruleJudgement.isEvaluated()) {
			return ruleJudgement;
		}
		if (model.requiresBaseline() && mlBaseline == null) {
			// 규칙 기반 결과로 흘리지 않고 보류한다. 델타 판정기를 골라 놓고 실제로는 규칙 기반 결과를
			// 받으면, 방식별 정확도를 비교하는 실험이 통째로 무의미해진다. 화면에는 재캘리브레이션이 필요하다고 뜬다.
			return Judgement.skipped(ruleJudgement.type(), "NO_ML_BASELINE");
		}
		int severity = toSeverity(model.probability(ml, mlBaseline));
		return severity == 0
				? Judgement.normal(ruleJudgement.type(), ruleJudgement.deviationDegrees())
				: Judgement.detected(ruleJudgement.type(), severity, ruleJudgement.deviationDegrees());
	}

	/**
	 * 확률을 심각도 0~5로 옮긴다. 규칙 기반의 {@code severity-degrees}와 같은 방식이라 뒤쪽(30초 윈도우·알림 임계값)이
	 * 그대로 동작한다.
	 */
	private int toSeverity(double probability) {
		int severity = 0;
		for (double boundary : severityProbabilities) {
			if (probability < boundary) {
				break;
			}
			severity++;
		}
		return severity;
	}
}
