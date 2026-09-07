// 턱 괴기(chin rest) 판정.
// ai/src/chin_rest_calib_test.py 와 수식 1:1 대응한다. 임계값도 같은 값을 쓴다.
import type { NormalizedLandmark } from '@mediapipe/tasks-vision';

import { LM, dist, mid, px, type Point } from './landmarks';

/**
 * 손목~턱 거리(어깨너비 대비). 들어갈 때와 나올 때를 다르게 둬야 경계에서 깜빡이지 않는다.
 *
 * 어깨너비의 0.32면 얼굴 폭의 3분의 2쯤이다. 처음에 0.55로 뒀더니 얼굴 폭의 한 배가 넘어서
 * 손이 얼굴 근처 어디에 있든 걸렸다.
 */
export const CHIN_NEAR = 0.32;
export const CHIN_FAR = 0.45;

/**
 * 손목이 턱보다 위로 이만큼(어깨너비 대비)까지만 올라가도 된다.
 *
 * 거리만 보면 입·코에 손을 대도 턱과 가까워서 걸린다. 턱을 괴는 것은 손이 턱을 <b>받치는</b>
 * 동작이라 손목이 턱 아래에 온다. 얼굴 축(눈→입 방향)에 투영해 위아래를 가른다.
 */
export const ABOVE_CHIN_LIMIT = 0.06;

/**
 * 팔꿈치가 어깨보다 이만큼(어깨너비 대비) 아래여야 "괴었다"로 본다.
 * 책상에 팔꿈치를 짚는 동작이라 낮게 내려간다. 얼굴을 긁으려고 손만 올리면 덜 내려간다.
 */
export const ELBOW_MIN_DROP = 0.15;

/** 얼굴·어깨가 이 미만이면 가려진 것으로 본다 */
const MIN_VISIBILITY = 0.5;

/**
 * 손목·손끝은 훨씬 낮게 잡는다.
 *
 * 턱을 괴면 손이 얼굴·목과 겹치고 팔뚝은 화면 아래로 잘려 나간다. BlazePose 는 그런 관절의
 * visibility 를 크게 떨어뜨린다 — 하필 <b>판정해야 하는 바로 그 순간에</b> 손이 "안 보이는"
 * 것으로 처리된다. 얼굴·어깨와 같은 0.5 를 쓰면 정면 클로즈업 화각에서 거의 안 잡힌다.
 *
 * 느슨하게 둬도 오탐이 늘지 않는다. 실제 판정은 거리(CHIN_NEAR)·방향(ABOVE_CHIN_LIMIT)·
 * 팔꿈치(ELBOW_MIN_DROP) 세 관문이 하고, 이 값은 "좌표를 믿을지"만 정한다.
 */
const MIN_HAND_VISIBILITY = 0.2;

/** 왜 못 쟀는지. 화면에 원인을 그대로 보여줘야 카메라를 어떻게 고칠지 알 수 있다 */
export type ChinRestBlockedReason =
  | 'NO_POSE' // 사람이 안 잡힘
  | 'FACE_HIDDEN' // 눈·입·어깨 중 하나가 가려짐
  | 'HAND_HIDDEN'; // 양손 다 화면에서 못 찾음

export type ChinRestMeasure =
  | { ok: true; sample: ChinRestSample }
  | { ok: false; reason: ChinRestBlockedReason };

/** 턱 위치 추정 계수. 입 중점에서 (입 중점 - 눈 중점) 방향으로 이만큼 더 내려간 곳 */
const CHIN_EXTEND = 0.7;

/** 얼굴·몸통 기준점. 이게 안 보이면 아무것도 못 잰다 */
const CORE = [
  LM.LEFT_EYE_OUTER,
  LM.RIGHT_EYE_OUTER,
  LM.MOUTH_LEFT,
  LM.MOUTH_RIGHT,
  LM.LEFT_SHOULDER,
  LM.RIGHT_SHOULDER,
];

export interface ChinRestSample {
  /**
   * 손~턱 거리를 어깨너비로 나눈 값. 작을수록 턱에 가깝다.
   *
   * 손목이 아니라 손목·검지·새끼 중 <b>턱에 가장 가까운 점</b>까지를 잰다. 주먹을 쥐고 괴면
   * 턱에 닿는 것은 손등이고 손목은 한 뼘 아래로 내려가, 손목만 보면 안 괸 것으로 읽힌다.
   */
  distance: number;
  /**
   * <b>손목</b>이 턱보다 얼마나 위에 있는지(어깨너비 대비). 양수면 턱 위, 음수면 턱 아래.
   *
   * 거리와 달리 이건 손끝이 아니라 손목으로 잰다. 턱을 괴는 자세는 손이 어떤 모양이든
   * 팔이 아래에서 올라와 손목이 턱 밑에 놓인다. 손끝으로 재면 뺨에 손바닥을 댔을 때
   * 손가락이 광대 위로 올라가 정상적인 괴기까지 걸러진다.
   */
  aboveChin: number;
  /** 팔꿈치가 어깨보다 얼마나 아래인지(어깨너비 대비). 양수면 아래 */
  elbowDrop: number;
  /** 판정에 쓴 쪽 */
  side: 'left' | 'right';
  /** 팔꿈치까지 보였는지. 안 보이면 팔꿈치 조건을 건너뛴다 */
  elbowVisible: boolean;
}

function visible(lms: NormalizedLandmark[], idx: number): boolean {
  return (lms[idx].visibility ?? 1) >= MIN_VISIBILITY;
}

function handVisible(lms: NormalizedLandmark[], idx: number): boolean {
  return (lms[idx].visibility ?? 1) >= MIN_HAND_VISIBILITY;
}

/**
 * 랜드마크에서 턱 괴기 지표를 잰다. 못 재면 이유를 함께 돌려준다.
 *
 * 거리는 전부 **어깨 너비**로 나눈다. 얼굴 폭을 쓰지 않는 이유는, 턱을 괴면 손이 턱·볼·귀를
 * 가려서 하필 판정해야 하는 순간에 자(尺)가 흔들리기 때문이다. 어깨는 턱 괴기로 안 가려진다.
 */
export function measureChinRest(
  lms: NormalizedLandmark[],
  width: number,
  height: number,
): ChinRestMeasure {
  if (lms.length < 21) return { ok: false, reason: 'NO_POSE' };
  if (CORE.some((i) => !visible(lms, i))) {
    return { ok: false, reason: 'FACE_HIDDEN' };
  }

  const ls = px(lms, LM.LEFT_SHOULDER, width, height);
  const rs = px(lms, LM.RIGHT_SHOULDER, width, height);
  const shoulderWidth = dist(ls, rs);
  // 어깨 폭이 0 이면 영상 크기를 못 읽은 것이다(videoWidth 0). 사람 문제가 아니다.
  if (shoulderWidth < 1e-6) return { ok: false, reason: 'NO_POSE' };

  const eyeMid = mid(
    px(lms, LM.LEFT_EYE_OUTER, width, height),
    px(lms, LM.RIGHT_EYE_OUTER, width, height),
  );
  const mouthMid = mid(
    px(lms, LM.MOUTH_LEFT, width, height),
    px(lms, LM.MOUTH_RIGHT, width, height),
  );
  // 눈→입 방향을 그대로 연장해 턱을 잡는다. Pose 에는 턱 랜드마크가 없다.
  // 고개를 기울이면 이 축도 같이 기울어 따라간다.
  const chin: Point = {
    x: mouthMid.x + (mouthMid.x - eyeMid.x) * CHIN_EXTEND,
    y: mouthMid.y + (mouthMid.y - eyeMid.y) * CHIN_EXTEND,
  };

  const shoulderY = (ls.y + rs.y) / 2;

  // 얼굴이 향하는 "아래" 방향 단위벡터. 고개를 기울여도 같이 기울어서, 화면의 아래가 아니라
  // 얼굴 기준의 아래로 위아래를 가를 수 있다.
  const axis = { x: mouthMid.x - eyeMid.x, y: mouthMid.y - eyeMid.y };
  const axisLen = Math.hypot(axis.x, axis.y);
  if (axisLen < 1e-6) return { ok: false, reason: 'FACE_HIDDEN' };
  const down = { x: axis.x / axisLen, y: axis.y / axisLen };

  let best: ChinRestSample | null = null;
  for (const side of ['left', 'right'] as const) {
    const wristIdx = side === 'left' ? LM.LEFT_WRIST : LM.RIGHT_WRIST;
    const elbowIdx = side === 'left' ? LM.LEFT_ELBOW : LM.RIGHT_ELBOW;
    // 손이 안 보이면 후보에서 뺀다. "안 보임"과 "안 괴었음"은 다르다.
    if (!handVisible(lms, wristIdx)) continue;

    const wrist = px(lms, wristIdx, width, height);
    const elbow = px(lms, elbowIdx, width, height);

    // 손목·검지·새끼 중 턱에 가장 가까운 점. 주먹이든 편 손이든 실제로 턱에 닿는 부분을 잡는다.
    // 손끝 점들은 가려지면 신뢰도가 떨어지므로 보이는 것만 후보로 둔다(손목은 위에서 확인됨).
    const handIdx = [
      wristIdx,
      side === 'left' ? LM.LEFT_INDEX : LM.RIGHT_INDEX,
      side === 'left' ? LM.LEFT_PINKY : LM.RIGHT_PINKY,
    ].filter((i) => i === wristIdx || handVisible(lms, i));
    const handDistance = Math.min(
      ...handIdx.map((i) => dist(px(lms, i, width, height), chin)),
    );
    // 턱에서 손목까지의 벡터를 얼굴 축에 투영한다. 축 방향(아래)이면 양수라
    // 부호를 뒤집어야 "턱보다 위"가 양수가 된다.
    const fromChin = { x: wrist.x - chin.x, y: wrist.y - chin.y };
    const alongDown = fromChin.x * down.x + fromChin.y * down.y;

    const sample: ChinRestSample = {
      distance: handDistance / shoulderWidth,
      aboveChin: -alongDown / shoulderWidth,
      // 화면 좌표는 아래로 갈수록 y 가 커진다. 팔꿈치가 어깨보다 아래면 양수
      elbowDrop: (elbow.y - shoulderY) / shoulderWidth,
      side,
      elbowVisible: visible(lms, elbowIdx),
    };
    if (best === null || sample.distance < best.distance) best = sample;
  }

  return best === null
    ? { ok: false, reason: 'HAND_HIDDEN' }
    : { ok: true, sample: best };
}

/**
 * 이 프레임이 턱 괴기 후보인지. 확정은 시간(지속)이 정하므로 여기서는 프레임 단위만 본다.
 *
 * @param active 직전까지 괴고 있던 상태인지. 나올 때 기준을 느슨하게 하는 데 쓴다.
 */
export function isChinRestFrame(
  sample: ChinRestSample | null,
  active: boolean,
): boolean {
  if (sample === null) return false;
  if (sample.distance > (active ? CHIN_FAR : CHIN_NEAR)) return false;
  // 입·코를 만지는 손은 턱보다 위에 있다. 턱을 괸 손은 턱을 받치므로 아래에 온다.
  if (sample.aboveChin > ABOVE_CHIN_LIMIT) return false;
  // 팔꿈치가 책상에 잘려 화면 밖이면 이 조건은 못 본다. 그때는 손목만으로 판단한다.
  if (sample.elbowVisible && sample.elbowDrop < ELBOW_MIN_DROP) return false;
  return true;
}
