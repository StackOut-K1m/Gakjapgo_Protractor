// src/types/posture.ts
export type CameraStatus = 'idle' | 'connecting' | 'connected' | 'denied';

export type DetectionStatus =
  | 'detecting'   // 확인 중 (주황 배지)
  | 'not-found'   // 사람 인식 실패 (빨강 오버레이)
  | 'verified';   // 통과 (초록 배지 + 버튼 활성화)

export interface PostureResult {
  personFound: boolean;
  isGoodPosture: boolean;
}

// ─────────────────────────────────────────────────────────────
// 서버 자세 판정 API 계약 (POST /study-sessions/{sessionId}/posture-frames)
//
// 백엔드 PostureFeatures / PostureMlFeatures / PostureFrameResponse 와 1:1 대응한다.
// 필드를 바꾸면 서버 DTO도 같이 바꿔야 하며, mlFeatures 는 학습 노트북과도 맞춰야 한다.
// ─────────────────────────────────────────────────────────────

/**
 * 서버가 감지하는 자세 2종. 서로 독립적으로 판정된다.
 *
 * 라운드숄더는 없다 — 사람마다 지표가 움직이는 방향이 반대여서(6명 데이터에서 p2 -8.5σ /
 * p5 +3.3σ) 어떤 임계값을 넣어도 절반은 틀린다. 그 자리는 턱 괴기가 대신하며, 그쪽은
 * 브라우저가 판정해 posture-checks 로 보낸다(서버 판정이 아니라 이 목록에 없다).
 */
export type PostureType =
  | 'FORWARD_HEAD'      // 거북목
  | 'SHOULDER_TILT';    // 어깨 높낮이

/** 화면 표시 순서 — 서버 응답 순서에 기대지 않으려고 고정한다. */
export const POSTURE_TYPES: PostureType[] = ['FORWARD_HEAD', 'SHOULDER_TILT'];

export const POSTURE_TYPE_LABEL: Record<PostureType, string> = {
  FORWARD_HEAD: '거북목',
  SHOULDER_TILT: '어깨 높낮이',
};

/**
 * 학습 모델 전용 피처 12개. 하이브리드 판정기(로지스틱 회귀)만 사용한다.
 * 서버가 detector=rule-based 로 떠 있으면 받기만 하고 쓰지 않는다.
 *
 * 순서는 학습 노트북의 FEATURE_ORDER 와 같게 유지한다 — 두 목록을 나란히 놓고
 * 대조할 수 있어야 피처를 추가할 때 빠뜨리지 않는다.
 */
export interface PostureMlFeatures {
  eyeDistRatio: number;
  earDistRatio: number;
  noseAboveShoulder: number;
  earAboveShoulder: number;
  noseZRel: number;
  earZRel: number;
  acromionProxy: number;
  headRoll: number;
  shoulderTilt: number;
  /** |shoulderTilt|. 선형 모델이 "어느 쪽으로 기울든 나쁨"을 배우려면 부호 없는 값이 필요하다 */
  absShoulderTilt: number;
  /** |headRoll|. 위와 같은 이유 */
  absHeadRoll: number;
  /** 좌우 어깨의 깊이 차. 몸통 회전과 라운드숄더를 구분한다 */
  shoulderZSpread: number;
}

/** 자세 피처 벡터 v1. mlFeatures 를 뺀 나머지는 서버에서 전부 필수값이다. */
export interface PostureFeatures {
  capturedAtMillis: number;
  earShoulderOffsetRatio: number;
  earShoulderVerticalRatio: number;
  shoulderToFaceWidthRatio: number;
  shoulderTiltRatio: number;
  torsoRotationRatio: number;
  neckFlexionRatio: number;
  faceWidthRatio: number;
  earVisibility: number;
  shoulderVisibility: number;
  /** 랜드마크가 모자라 못 만들면 null. 서버는 그 프레임을 규칙 기반으로 판정한다 */
  mlFeatures: PostureMlFeatures | null;
}

/** 캘리브레이션 기준선 = 바른 자세 구간에서 모은 피처의 평균 */
export interface PostureBaseline {
  version: 'v1';
  earShoulderOffsetRatio: number;
  earShoulderVerticalRatio: number;
  shoulderToFaceWidthRatio: number;
  shoulderTiltRatio: number;
  sampleCount: number;
  /**
   * 같은 구간에서 모은 ML 피처의 평균. hybrid-delta 판정기가 "이 사람 기준 대비 얼마나
   * 벗어났는가"를 계산하는 데 쓴다.
   *
   * null 인 경우는 둘이다 — 캘리브레이션 프레임에서 랜드마크가 모자라 mlFeatures 를 한 번도
   * 못 만들었거나, hybrid-delta 가 생기기 전에 저장된 기준선이거나. 서버는 그때 델타 판정을
   * 보류하고(NO_ML_BASELINE) 재캘리브레이션을 유도한다.
   */
  mlBaseline?: PostureMlFeatures | null;
}

/** 자세 1종 판정. severity 가 null 이면 판정 보류(가려짐·몸통 회전)다. */
export interface PostureJudgement {
  type: PostureType;
  severity: number | null;
  deviationDegrees: number | null;
  skipReason: string | null;
}

export interface PostureFrameResponse {
  /** 3종 모두 정상인지. 보류가 하나라도 있으면 false */
  goodPosture: boolean;
  judgements: PostureJudgement[];
  /** 이번 프레임에 지속이 확정된 자세 — 경고 대상 */
  confirmed: PostureType[];
  /** 이번 프레임에 해소된 자세 */
  resolved: PostureType[];
  /**
   * 이 프레임을 실제로 판정한 판정기 키.
   *
   * 보낸 값이 아니라 쓰인 값이다. 지정하지 않고 보내면 서버 기본값이 돌아오므로,
   * 선택이 반영됐는지 이 값으로 확인한다.
   */
  detector: string;
}

/**
 * 기준선 없는 한 프레임 판정 응답 (POST /posture-frames/preview).
 *
 * 입장 준비화면이 캘리브레이션 전에 쓴다. confirmed·resolved 가 없다 — 관찰 구간은 세션에
 * 딸린 상태이고 여기에는 세션이 없다.
 *
 * 각 judgement 의 deviationDegrees 는 <b>항상 null</b> 이다. 각도는 기준선 대비로만 뜻이 있는
 * 값이라 기준선이 없는 이 경로에서는 만들 수 없다. 화면은 severity 만 본다.
 */
export interface PosturePreviewResponse {
  judgements: PostureJudgement[];
  detector: string;
}

// ─────────────────────────────────────────────────────────────
// 판정 방식 비교 (GET /posture-detectors)
//
// 방식이 몇 개가 될지 정해두지 않았다. 목록을 서버에서 받아 버튼을 그리므로
// 새 판정기가 추가돼도 이 파일과 화면 코드는 바뀌지 않는다.
// ─────────────────────────────────────────────────────────────

export interface PostureDetectorInfo {
  /** posture-frames 요청에 넣는 값 */
  key: string;
  /** 판정 버전까지 포함한 이름. 서버가 events.metadata 에 남기는 값과 같다 */
  name: string;
  description: string;
  /** 요청이 판정기를 지정하지 않았을 때 쓰이는 것인지 */
  isDefault: boolean;
}

// ─────────────────────────────────────────────────────────────
// 실시간 신호등
// ─────────────────────────────────────────────────────────────

/**
 * 이 심각도부터 서버가 "위험"으로 세기 시작한다. 서버 app.posture.alert-severity 와 같은 값이다.
 *
 * 서버 설정을 바꾸면 여기도 같이 바꿔야 한다. 어긋나도 판정 자체는 서버가 하므로 결과는
 * 틀리지 않지만, 화면의 빨간불과 실제 확정 시점이 따로 놀게 된다.
 *
 * 4에서 1로 내렸다. 나쁜 자세면 곧장 빨간불로 보여주기로 했고, 재학습한 모델이 심각도 4
 * (확률 0.85)에 거의 닿지 않아 4로 두면 경고가 사실상 안 뜬다.
 */
export const ALERT_SEVERITY = 1;

/**
 * 이 심각도 이하면 "자세가 돌아왔다"로 본다. 서버 app.posture.release-severity 와 같은 값이다.
 *
 * 확정 기준보다 낮게 두는 이유는 서버와 같다 — 같은 값을 쓰면 임계값 근처에서 경고가 깜빡인다.
 * 확정이 1이 되면서 이 값은 0 밖에 될 수 없다.
 */
export const RELEASE_SEVERITY = 0;

/**
 * 프레임 하나의 상태를 신호등 색으로 옮긴 것.
 *
 * - ok      정상 (severity 0)
 * - danger  나쁜 자세 — 이대로 10초가 지나면 경고 1회로 확정된다
 * - paused  판정 보류 (가려짐·몸통 회전·기준선 없음)
 *
 * caution(노랑)은 더 이상 나오지 않는다. 예전에는 "나쁘지만 아직 확정 기준 미만" 구간이라
 * 노랑이었는데, 확정 기준을 1로 내리면서 그 사이가 없어졌다. 사용자가 할 행동도 어느 단계든
 * "고쳐 앉기"로 같아서 두 색으로 나누는 값어치가 없었다.
 * 타입에는 남겨 둔다 — 다른 화면(코칭·PiP)이 자기 기준으로 쓰고 있다.
 */
export type PostureLight = 'ok' | 'caution' | 'danger' | 'paused';

export function toPostureLight(judgement: PostureJudgement): PostureLight {
  if (judgement.severity === null) return 'paused';
  return judgement.severity >= ALERT_SEVERITY ? 'danger' : 'ok';
}

/** 판정 보류 사유를 화면 문구로. 서버가 새 사유를 추가하면 원문이 그대로 보인다 */
export const SKIP_REASON_LABEL: Record<string, string> = {
  NO_BASELINE: '기준 자세 없음',
  // hybrid-delta 전용. 기준선은 있는데 ML 평균이 없는 경우다(그 판정기가 생기기 전에 잡은 기준선).
  NO_ML_BASELINE: '기준 자세 다시 잡기 필요',
  LOW_VISIBILITY: '가려짐',
  TORSO_ROTATED: '몸통 회전',
  INVALID_GEOMETRY: '인식 불안정',
};