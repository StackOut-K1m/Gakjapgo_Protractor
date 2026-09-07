package com.protractor.backend.domain.posture.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotNull;

/**
 * 학습 모델 전용 피처 블록. {@link PostureFeatures}에 선택적으로 실려 오며, 하이브리드 판정기(로지스틱 회귀)만 사용한다.
 *
 * <p>
 * v1 피처 벡터로는 이 값을 만들 수 없어서 따로 받는다. 모델이 쓰는 값 중 눈 좌표(눈 간격·머리 기울기)와 MediaPipe의 z(깊이)
 * 기반 항목은 v1에 아예 없고, 그중 {@code earZRel}과 {@code acromionProxy}는 가중치가 커서 빼면 모델이 무의미해진다.
 *
 * <p>
 * v1 필드를 고치지 않고 <b>블록을 덧붙이는</b> 방식을 택한 이유는, 피처 벡터 v1이 판정 방식 3종의 공통 입력으로 동결돼 있기
 * 때문이다. 필드를 바꾸면 규칙 기반 판정기·캘리브레이션 기준선·기존 이벤트 기록이 모두 무효가 된다. 블록이 없는 요청은 예전처럼 그대로
 * 동작하고, 하이브리드 판정기는 그 프레임을 규칙 기반으로 넘긴다.
 *
 * <p>
 * 값 4개({@code earDistRatio}, {@code noseAboveShoulder}, {@code earAboveShoulder},
 * {@code shoulderTilt})는 v1 필드에서 유도할 수도 있지만 <b>일부러 중복해서 받는다</b>. v1은 부호를 죽이거나
 * (절댓값) 부호 방향이 반대인 항목이 있어서, 유도해 쓰면 학습 때와 미묘하게 다른 값이 들어갈 수 있다. 브라우저가 학습 노트북의
 * {@code compute_features}를 그대로 옮겨 9개를 통째로 계산하면 학습·추론이 확실히 같은 값을 쓴다.
 *
 * <p>
 * <b>전부 채우거나 블록 자체를 빼거나</b> 둘 중 하나다. 일부만 채우면 모델이 쓸 수 없어 검증에서 막는다.
 *
 * <p>
 * <b>필드 순서는 학습 노트북의 {@code FEATURE_ORDER}와 같게 유지한다.</b> 값은 이름으로 꺼내므로 순서가 틀려도 동작은 하지만,
 * 두 목록을 나란히 놓고 눈으로 대조할 수 있어야 피처를 추가할 때 빠뜨리지 않는다.
 *
 * <p>
 * {@code absShoulderTilt}·{@code absHeadRoll}은 {@code shoulderTilt}·{@code headRoll}의 절댓값이라
 * 서버에서 만들 수도 있지만, 그러면 "모든 피처가 학습 평균일 때 확률 = sigmoid(intercept)"를 확인하는 테스트를 세울 수 없다.
 * {@code mean(|x|)}와 {@code |mean(x)|}는 다른 값이라 두 피처를 동시에 평균에 맞출 수 없기 때문이다. 그 테스트가 표준화
 * 누락과 피처 순서 어긋남을 잡는 유일한 장치라서, 중복을 감수하고 받는 쪽을 택했다.
 *
 * <p>
 * 좌표 단위는 학습과 같아야 한다. x·y는 픽셀, z는 {@code landmark.z * 이미지너비}다.
 *
 * @param eyeDistRatio 좌우 눈 간격 / 어깨너비
 * @param earDistRatio 좌우 귀 간격 / 어깨너비
 * @param noseAboveShoulder (어깨중점 y - 코 y) / 어깨너비. 위로 갈수록 양수다
 * @param earAboveShoulder (어깨중점 y - 귀중점 y) / 어깨너비
 * @param noseZRel (코 z - 어깨중점 z) / 어깨너비. 앞으로 나올수록 음수다
 * @param earZRel (귀중점 z - 어깨중점 z) / 어깨너비
 * @param acromionProxy 귀-어깨 측면거리 근사. hypot(수직차, 깊이차) / 어깨너비
 * @param headRoll (오른눈 y - 왼눈 y) / 눈 간격. 고개 좌우 기울기
 * @param shoulderTilt (오른어깨 y - 왼어깨 y) / 어깨너비. <b>v1의
 *     {@code shoulderTiltRatio}와 부호가 반대</b>다
 * @param absShoulderTilt {@code |shoulderTilt|}. 로지스틱 회귀는 선형이라 부호 있는 값만으로는 "어느 쪽으로 기울든
 *     나쁨"을 배울 수 없다. 이것이 없으면 왼쪽 기울기를 나쁨으로 배우는 순간 오른쪽 기울기가 "아주 좋은 자세"가 된다
 * @param absHeadRoll {@code |headRoll|}. 위와 같은 이유다
 * @param shoulderZSpread |왼어깨 z - 오른어깨 z| / 어깨너비. 몸통을 틀면 커지므로 라운드숄더와 회전을 구분하는 데 쓴다
 */
@Schema(description = "학습 모델 전용 피처(하이브리드 판정기용, 선택)")
public record PostureMlFeatures(
		@Schema(description = "눈 간격 / 어깨너비", example = "0.19") @NotNull Double eyeDistRatio,
		@Schema(description = "귀 간격 / 어깨너비", example = "0.35") @NotNull Double earDistRatio,
		@Schema(description = "코가 어깨선 위로 뜬 정도 / 어깨너비", example = "0.54") @NotNull Double noseAboveShoulder,
		@Schema(description = "귀가 어깨선 위로 뜬 정도 / 어깨너비", example = "0.59") @NotNull Double earAboveShoulder,
		@Schema(description = "코의 상대 깊이 / 어깨너비", example = "-1.39") @NotNull Double noseZRel,
		@Schema(description = "귀의 상대 깊이 / 어깨너비", example = "-0.41") @NotNull Double earZRel,
		@Schema(description = "귀-어깨 측면거리 근사 / 어깨너비", example = "0.73") @NotNull Double acromionProxy,
		@Schema(description = "고개 좌우 기울기", example = "0.08") @NotNull Double headRoll,
		@Schema(description = "좌우 어깨 높이차 / 어깨너비(v1과 부호 반대)", example = "0.03") @NotNull Double shoulderTilt,
		@Schema(description = "shoulderTilt의 절댓값", example = "0.03") @NotNull Double absShoulderTilt,
		@Schema(description = "headRoll의 절댓값", example = "0.08") @NotNull Double absHeadRoll,
		@Schema(description = "좌우 어깨 깊이차 / 어깨너비", example = "0.06") @NotNull Double shoulderZSpread) {

	/**
	 * 학습 때 쓴 피처 이름으로 값을 꺼낸다.
	 *
	 * <p>
	 * 모델 JSON의 {@code feature_order}가 계산 순서를 정하므로, 자바 필드 순서가 아니라 <b>이름</b>으로 맞춰야 한다.
	 * 순서에 의존하면 모델을 다시 학습해 피처 순서가 바뀌었을 때 조용히 틀린 확률이 나온다.
	 *
	 * @param featureName 학습 노트북의 snake_case 피처 이름
	 * @return 해당 피처 값. 모르는 이름이면 null
	 */
	public Double valueOf(String featureName) {
		return switch (featureName) {
			case "eye_dist_ratio" -> eyeDistRatio;
			case "ear_dist_ratio" -> earDistRatio;
			case "nose_above_shoulder" -> noseAboveShoulder;
			case "ear_above_shoulder" -> earAboveShoulder;
			case "nose_z_rel" -> noseZRel;
			case "ear_z_rel" -> earZRel;
			case "acromion_proxy" -> acromionProxy;
			case "head_roll" -> headRoll;
			case "shoulder_tilt" -> shoulderTilt;
			// 라벨 누수를 고치면서 학습 쪽 피처 이름이 shoulder_tilt -> shoulder_tilt_signed로 바뀌었다.
			// FEATURE_ORDER와 LABELS에 'shoulder_tilt'가 같이 있어서 피처값이 0/1 라벨로 덮어써지고 있었고,
			// 이름을 갈라 그 충돌을 없앤 것이다. 값의 정의는 그대로라 같은 필드를 돌려준다.
			// 옛 모델 파일도 계속 읽을 수 있게 두 이름을 모두 받는다.
			case "shoulder_tilt_signed" -> shoulderTilt;
			case "abs_shoulder_tilt" -> absShoulderTilt;
			case "abs_head_roll" -> absHeadRoll;
			// 어깨중점 기준 코의 깊이. noseZRel과 부호만 반대인 같은 값이라 클라이언트가 따로 보내지
			// 않는다(학습 노트북도 "shoulder_z_rel = -nose_z_rel" 이라 적고 하나를 뺐다).
			// 그런데 모델 JSON에는 두 이름이 다 남아 있어, 받는 쪽에서 부호를 뒤집어 만들어 준다.
			case "shoulder_z_rel" -> noseZRel == null ? null : -noseZRel;
			case "shoulder_z_spread" -> shoulderZSpread;
			default -> null;
		};
	}
}
