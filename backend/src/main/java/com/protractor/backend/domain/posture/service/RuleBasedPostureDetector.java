package com.protractor.backend.domain.posture.service;

import com.protractor.backend.domain.posture.dto.PostureBaseline;
import com.protractor.backend.domain.posture.dto.PostureFeatures;
import com.protractor.backend.domain.posture.dto.PostureResult;
import com.protractor.backend.domain.posture.dto.PostureResult.Judgement;
import com.protractor.backend.domain.posture.entity.PostureType;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.List;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

/**
 * 규칙 기반 자세 판정기(방법 1). 관절 사이의 각도와 거리를 직접 계산해 판정하며 학습이 필요 없다.
 *
 * <p>
 * 판정은 절대값이 아니라 <b>캘리브레이션 기준선 대비 편차</b>로 한다. 목이 원래 긴 사람과 어깨가 원래 비대칭인 사람에게 같은 절대
 * 임계값을 적용하면 한쪽은 계속 경고를 받고 다른 쪽은 아무리 구부려도 걸리지 않기 때문이다.
 *
 * <p>
 * 모든 지표를 <b>각도로 환산</b>해 내보낸다. 비율 그대로 저장하면 events.deviation_degrees의 의미가 깨지고, 나중에
 * 다른 판정 방식과 비교할 때 단위가 달라 맞대볼 수 없다.
 *
 * <p>
 * 임계값은 설정으로 뺐다. 데이터가 쌓이면 값을 조정하게 되는데, 그때마다 코드를 고치고 재배포하지 않기 위해서다.
 */
@Service
public class RuleBasedPostureDetector implements PostureDetector {

	/** API·설정에서 쓰는 키. 판정 버전이 올라가도 이 값은 그대로 둔다. */
	static final String KEY = "rule-based";

	private static final String NAME = "rule-based-v1";

	private final double minVisibility;
	private final double maxTorsoRotation;
	private final double[] forwardHeadDegrees;
	private final double[] shoulderTiltDegrees;

	// @Value는 application.yml에 정의된 값
	public RuleBasedPostureDetector(@Value("${app.posture.min-visibility}") double minVisibility,
			@Value("${app.posture.max-torso-rotation}") double maxTorsoRotation,
			@Value("${app.posture.severity-degrees.forward-head}") double[] forwardHeadDegrees,
			@Value("${app.posture.severity-degrees.shoulder-tilt}") double[] shoulderTiltDegrees) {
		this.minVisibility = minVisibility;
		this.maxTorsoRotation = maxTorsoRotation;
		this.forwardHeadDegrees = forwardHeadDegrees;
		this.shoulderTiltDegrees = shoulderTiltDegrees;
	}

	@Override
	public String key() {
		return KEY;
	}

	@Override
	public String description() {
		return "관절 각도·거리를 공식으로 계산한다. 학습이 필요 없고 판정 근거를 각도로 설명할 수 있다.";
	}

	@Override
	public String name() {
		return NAME;
	}

	/*
	 * 라운드숄더는 판정하지 않는다.
	 *
	 * 팀원 6명 좌표를 놓고 보니 어깨가 말릴 때 지표가 움직이는 방향이 사람마다 반대였다
	 * (p2 -8.5σ, p5 +3.3σ). 부호조차 정할 수 없는 지표라 어떤 임계값을 넣어도 절반은 틀린다.
	 * 공부방에서는 그 자리를 턱 괴기가 대신한다(브라우저 판정 → posture-checks).
	 *
	 * 판정뿐 아니라 타입 상수·점수 컬럼·리포트 항목까지 전부 걷어냈다. 판정하지 않는 항목을
	 * "측정 안 함"으로 남겨 두니 화면과 소견서에 계속 등장해 오히려 혼란만 줬다.
	 * DB의 옛 ROUNDED_SHOULDER 이벤트는 집계에서 '기타 자세'로 접힌다.
	 */

	// 매 초 자세 각각 판정
	@Override
	public PostureResult detect(PostureFeatures f, PostureBaseline base) {
		// 기준선 버전이 다르면 지표 정의가 달라 비교 자체가 성립하지 않는다. 모두 보류한다.
		if (base == null || !base.isCompatible()) {
			List<Judgement> skipped = List.of(Judgement.skipped(PostureType.FORWARD_HEAD, "NO_BASELINE"),
					Judgement.skipped(PostureType.SHOULDER_TILT, "NO_BASELINE"));
			return new PostureResult(NAME, skipped);
		}
		return new PostureResult(NAME, List.of(judgeForwardHead(f, base), judgeShoulderTilt(f, base)));
	}

	/**
	 * 기준선이 필요 없는 사전 검사. 이 프레임의 피처를 믿을 수 있는지만 본다.
	 *
	 * <p>
	 * 통과하면 {@code null}, 못 믿으면 보류 판정을 돌려준다. 기준선 대비 각도 계산과 분리해 둔 이유는 캘리브레이션 전에도
	 * 이 검사만은 할 수 있어야 해서다 — 준비화면은 기준선이 아직 없는 상태로 "지금 자세가 나쁜지"를 물어야 하고, 그때도 가려진
	 * 프레임이나 몸을 틀고 있는 프레임은 걸러야 한다(하이브리드 판정기의 preview 가 이 메서드를 쓴다).
	 *
	 * <p>
	 * 자세 종류마다 보는 것이 다르다. 거북목은 귀가 필요하고 몸통 회전에는 오히려 강한 반면, 어깨 높낮이는 귀가 필요 없고 몸을
	 * 틀면 판정이 불가능하다.
	 */
	Judgement screen(PostureFeatures f, PostureType type) {
		if (type == PostureType.FORWARD_HEAD) {
			if (f.earVisibility() < minVisibility || f.shoulderVisibility() < minVisibility) {
				return Judgement.skipped(type, "LOW_VISIBILITY");
			}
			// 수직 거리가 0 이하면 각도를 만들 수 없다(랜드마크가 뒤집혀 잡힌 경우).
			if (f.earShoulderVerticalRatio() <= 0) {
				return Judgement.skipped(type, "INVALID_GEOMETRY");
			}
			return null;
		}
		if (f.shoulderVisibility() < minVisibility) {
			return Judgement.skipped(type, "LOW_VISIBILITY");
		}
		if (f.torsoRotationRatio() > maxTorsoRotation) {
			return Judgement.skipped(type, "TORSO_ROTATED");
		}
		return null;
	}

	/**
	 * 거북목. 귀와 어깨를 잇는 선이 앞으로 얼마나 기울었는지를 각도로 재고, 기준선보다 더 기울었으면 나쁜 자세로 본다.
	 *
	 * <p>
	 * 정면 웹캠에서는 실제 경추추체각(CVA)을 잴 수 없다. 그건 완전한 측면 촬영을 전제로 하기 때문이다. 대신 귀-어깨의 수평·수직
	 * 거리비로 같은 성질의 각도를 만들어 쓴다. 몸을 틀어도 이 각도는 오히려 더 잘 보이므로 회전은 걸러내지 않는다.
	 */
	private Judgement judgeForwardHead(PostureFeatures f, PostureBaseline base) {
		PostureType type = PostureType.FORWARD_HEAD;
		Judgement blocked = screen(f, type);
		if (blocked != null) {
			return blocked;
		}
		// 기준선 쪽 수직 거리는 사전 검사에서 볼 수 없다(기준선을 안 넘겨받으므로) — 여기서 확인한다.
		if (base.earShoulderVerticalRatio() <= 0) {
			return Judgement.skipped(type, "INVALID_GEOMETRY");
		}
		double current = Math.toDegrees(Math.atan2(f.earShoulderOffsetRatio(), f.earShoulderVerticalRatio()));
		double baseline = Math.toDegrees(Math.atan2(base.earShoulderOffsetRatio(), base.earShoulderVerticalRatio()));
		return judge(type, current - baseline, forwardHeadDegrees);
	}

	/**
	 * 어깨 높낮이. 좌우 어깨의 높이 차이를 각도로 환산하고, 기준선에서 벗어난 정도로 판정한다.
	 *
	 * <p>
	 * 어느 쪽으로 기울든 문제이므로 편차의 절댓값을 쓴다. 원래 어깨가 살짝 비대칭인 사람은 기준선에 그 비대칭이 담겨 있어서, 평소
	 * 자세로는 걸리지 않는다.
	 */
	private Judgement judgeShoulderTilt(PostureFeatures f, PostureBaseline base) {
		PostureType type = PostureType.SHOULDER_TILT;
		Judgement blocked = screen(f, type);
		if (blocked != null) {
			return blocked;
		}
		double current = Math.toDegrees(Math.atan(f.shoulderTiltRatio()));
		double baseline = Math.toDegrees(Math.atan(base.shoulderTiltRatio()));
		return judge(type, Math.abs(current - baseline), shoulderTiltDegrees);
	}

	/**
	 * 이탈 각도를 심각도 0~5로 옮긴다.
	 *
	 * <p>
	 * 기준선보다 좋아진 경우(음수)는 0으로 본다.
	 */
	private Judgement judge(PostureType type, double deviationDegrees, double[] boundaries) {
		double deviation = Math.max(0, deviationDegrees);
		BigDecimal rounded = BigDecimal.valueOf(deviation).setScale(2, RoundingMode.HALF_UP);

		int severity = 0;
		for (double boundary : boundaries) {
			if (deviation < boundary) {
				break;
			}
			severity++;
		}
		return severity == 0 ? Judgement.normal(type, rounded) : Judgement.detected(type, severity, rounded);
	}
}
