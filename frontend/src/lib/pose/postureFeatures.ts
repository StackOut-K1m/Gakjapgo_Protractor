// 서버 자세 판정에 보내는 피처 추출.
//
// ⚠️ 이 파일은 backend 의 PostureFeatures / PostureMlFeatures 계약과 ai/train.ipynb 의
// compute_features 를 그대로 옮긴 것이다. 한 줄이라도 어긋나면 서버는 예외 없이
// "그럴듯하게 틀린" 판정을 내놓고, 그건 테스트 없이는 발견되지 않는다.
//
// landmarks.ts 의 computeMetrics 와 계산이 겹쳐 보이지만 일부러 합치지 않았다.
// computeMetrics 는 입장 준비 화면 전용이라 정의가 다르다.
//   - 눈 랜드마크가 EYE_OUTER(3·6)인데 학습 모델은 EYE(2·5)를 쓴다
//   - 어깨 기울기를 각도(도)로 내는데 서버 계약은 어깨너비로 나눈 비율이다
//   - 깊이(z)를 아예 보지 않는다
// 둘을 합치면 학습 때와 다른 값이 서버로 간다.
import type { NormalizedLandmark } from '@mediapipe/tasks-vision';

// 
import type {
  PostureBaseline,
  PostureFeatures,
  PostureMlFeatures,
} from '@/types/posture';

/** BlazePose 랜드마크 인덱스 — 서버 계약이 쓰는 것만 */
const NOSE = 0;
const L_EYE = 2;
const R_EYE = 5;
const L_EAR = 7;
const R_EAR = 8;
const L_SHOULDER = 11;
const R_SHOULDER = 12;

interface P2 {
  x: number;
  y: number;
  v: number;
}

interface P3 {
  x: number;
  y: number;
  z: number;
}

const dist2 = (a: P2 | P3, b: P2 | P3) => Math.hypot(a.x - b.x, a.y - b.y);

/**
 * 피처 벡터 v1 을 만든다. 어깨나 얼굴이 안 잡히면 null.
 *
 * MediaPipe 의 normalized 좌표는 x 가 이미지 너비, y 가 높이 기준이라 종횡비가 1이 아니면
 * 단위가 서로 다르다. 그래서 픽셀 좌표로 되돌려 계산한다.
 */
export function extractPostureFeatures(
  lm: NormalizedLandmark[],
  width: number,
  height: number,
): PostureFeatures | null {
  const P = (i: number): P2 => ({
    x: lm[i].x * width,
    y: lm[i].y * height,
    v: lm[i].visibility ?? 0,
  });
  const mid = (a: P2, b: P2) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, v: 0 });

  const nose = P(NOSE);
  const lEar = P(L_EAR);
  const rEar = P(R_EAR);
  const lSh = P(L_SHOULDER);
  const rSh = P(R_SHOULDER);

  const shoulderWidth = dist2(lSh, rSh);
  const faceWidth = dist2(lEar, rEar);
  if (shoulderWidth <= 0 || faceWidth <= 0) return null;

  const shMid = mid(lSh, rSh);
  const earMid = mid(lEar, rEar);

  return {
    capturedAtMillis: Date.now(),
    // 귀-어깨 중점의 수평/수직 거리. 서버는 거북목 각도를 atan2(수평, 수직)로 낸다
    earShoulderOffsetRatio: Math.abs(earMid.x - shMid.x) / shoulderWidth,
    earShoulderVerticalRatio: Math.abs(earMid.y - shMid.y) / shoulderWidth,
    // 어깨가 앞으로 말리면 정면 어깨 폭이 줄어든다. 카메라 거리 변화를 지우려고 얼굴 너비로 나눈다
    shoulderToFaceWidthRatio: shoulderWidth / faceWidth,
    // 어느 쪽 어깨가 올라갔는지 알아야 해서 부호를 유지한다
    shoulderTiltRatio: (lSh.y - rSh.y) / shoulderWidth,
    // 몸통 회전: 코에서 좌우 어깨까지 거리 차이. 크면 서버가 어깨 판정을 보류한다
    torsoRotationRatio:
      Math.abs(dist2(nose, lSh) - dist2(nose, rSh)) / shoulderWidth,
    neckFlexionRatio: Math.abs(nose.y - shMid.y) / shoulderWidth,
    faceWidthRatio: faceWidth / shoulderWidth,
    // 서버는 최솟값 기준으로 보류를 판단한다. 여기서 미리 최솟값을 낸다
    earVisibility: Math.min(lEar.v, rEar.v),
    shoulderVisibility: Math.min(lSh.v, rSh.v),
    mlFeatures: extractMlFeatures(lm, width, height),
  };
}

/**
 * 학습 모델 전용 피처 12개 — ai/train.ipynb 의 compute_features 와 100% 같아야 한다.
 *
 * v1 피처와 따로 계산하는 이유는 두 가지다.
 * 1) 학습 모델이 v1 에 없는 값을 쓴다 — 눈 좌표(눈 간격·머리 기울기)와 MediaPipe 의 z(깊이).
 * 2) 겹치는 4개도 정의가 미묘하게 다르다. v1 은 절댓값을 쓰거나(neckFlexionRatio)
 *    부호가 반대라서(shoulderTiltRatio), v1 에서 유도하면 학습 때와 다른 값이 들어간다.
 *
 * z 는 학습 때와 같은 스케일이어야 해서 x 와 같은 기준(이미지 너비)으로 되돌린다.
 *
 * 반환 순서는 노트북 FEATURE_ORDER 와 맞춰 둔다. 서버는 이름으로 꺼내 쓰므로 순서가 결과를
 * 바꾸지는 않지만, 목록을 나란히 놓고 대조할 수 있어야 피처를 빠뜨리지 않는다.
 */
export function extractMlFeatures(
  lm: NormalizedLandmark[],
  width: number,
  height: number,
): PostureMlFeatures | null {
  const P = (i: number): P3 => ({
    x: lm[i].x * width,
    y: lm[i].y * height,
    z: (lm[i].z ?? 0) * width,
  });
  const mid = (a: P3, b: P3): P3 => ({
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2,
    z: (a.z + b.z) / 2,
  });

  const nose = P(NOSE);
  const lEye = P(L_EYE);
  const rEye = P(R_EYE);
  const lEar = P(L_EAR);
  const rEar = P(R_EAR);
  const lSh = P(L_SHOULDER);
  const rSh = P(R_SHOULDER);

  const shoulderWidth = dist2(lSh, rSh);
  const eyeDist = dist2(lEye, rEye);
  // 서버는 블록이 통째로 있거나 없거나만 받는다. 하나라도 못 만들면 null 을 보내 규칙 기반으로 넘긴다
  if (shoulderWidth < 1e-6 || eyeDist < 1e-6) return null;

  const shMid = mid(lSh, rSh);
  const earMid = mid(lEar, rEar);
  const earShoulderDy = earMid.y - shMid.y;
  const earShoulderDz = earMid.z - shMid.z;

  const headRoll = (rEye.y - lEye.y) / eyeDist;
  const shoulderTilt = (rSh.y - lSh.y) / shoulderWidth;

  return {
    eyeDistRatio: eyeDist / shoulderWidth,
    earDistRatio: dist2(lEar, rEar) / shoulderWidth,
    noseAboveShoulder: (shMid.y - nose.y) / shoulderWidth,
    earAboveShoulder: (shMid.y - earMid.y) / shoulderWidth,
    noseZRel: (nose.z - shMid.z) / shoulderWidth,
    earZRel: earShoulderDz / shoulderWidth,
    // 귀-어깨 측면(수직+깊이) 2D 거리 근사. 선형결합으로는 못 만드는 신호라 따로 넣는다
    acromionProxy: Math.hypot(earShoulderDy, earShoulderDz) / shoulderWidth,
    headRoll,
    shoulderTilt,
    // 어느 쪽으로 기울든 나쁜 자세다. 선형 모델은 부호 있는 값 하나로 그걸 표현할 수 없다
    absShoulderTilt: Math.abs(shoulderTilt),
    absHeadRoll: Math.abs(headRoll),
    // 좌우 어깨의 깊이 차. 몸통을 튼 경우에 커지므로 라운드숄더와 회전을 구분한다
    shoulderZSpread: Math.abs(lSh.z - rSh.z) / shoulderWidth,
  };
}

/**
 * 캘리브레이션 기준선 = 수집한 피처의 평균. 서버 PostureBaseline 이 쓰는 v1 4개와,
 * 델타 판정기용 ML 피처 12개의 평균을 함께 낸다.
 *
 * 평균이 아니라 중앙값을 쓰지 않는 이유는 서버 계약(sampleCount 를 함께 받는 평균값)과
 * 맞추기 위해서다. 대신 표본이 적으면 기준선을 믿을 수 없으므로 호출부에서 최소 개수를 확인한다.
 */
export function averageBaseline(samples: PostureFeatures[]): PostureBaseline {
  const avg = (pick: (f: PostureFeatures) => number) =>
    samples.reduce((sum, f) => sum + pick(f), 0) / samples.length;

  return {
    version: 'v1',
    earShoulderOffsetRatio: avg((f) => f.earShoulderOffsetRatio),
    earShoulderVerticalRatio: avg((f) => f.earShoulderVerticalRatio),
    shoulderToFaceWidthRatio: avg((f) => f.shoulderToFaceWidthRatio),
    shoulderTiltRatio: avg((f) => f.shoulderTiltRatio),
    sampleCount: samples.length,
    mlBaseline: averageMlBaseline(samples),
  };
}

/**
 * ML 피처 12개의 평균. hybrid-delta 판정기가 델타를 만드는 피감수다.
 *
 * mlFeatures 가 없는 프레임(랜드마크 부족)은 빼고 평균을 낸다. 0 으로 채워 넣으면 평균이
 * 통째로 어긋나고, 그건 서버에서 "이 사람의 바른 자세"로 쓰이므로 판정이 조용히 틀어진다.
 * 하나도 없으면 null 을 보내고 서버가 델타 판정을 보류하게 둔다 — 없는 기준선을 지어내는 것보다 낫다.
 *
 * ⚠️ 학습 노트북(ai/train.ipynb 의 build_person_baselines)도 같은 정의를 쓴다.
 * 그쪽은 "바른 자세 영상 프레임의 피처 평균"이고 여기는 "캘리브레이션 구간의 피처 평균"이다.
 * 한쪽만 바꾸면 학습 때와 다른 기준선이 들어가 확률이 그럴듯하게 틀린다.
 */
function averageMlBaseline(samples: PostureFeatures[]): PostureMlFeatures | null {
  const ml = samples
    .map((f) => f.mlFeatures)
    .filter((m): m is PostureMlFeatures => m !== null);
  if (ml.length === 0) return null;

  const avg = (pick: (m: PostureMlFeatures) => number) =>
    ml.reduce((sum, m) => sum + pick(m), 0) / ml.length;

  return {
    eyeDistRatio: avg((m) => m.eyeDistRatio),
    earDistRatio: avg((m) => m.earDistRatio),
    noseAboveShoulder: avg((m) => m.noseAboveShoulder),
    earAboveShoulder: avg((m) => m.earAboveShoulder),
    noseZRel: avg((m) => m.noseZRel),
    earZRel: avg((m) => m.earZRel),
    acromionProxy: avg((m) => m.acromionProxy),
    headRoll: avg((m) => m.headRoll),
    shoulderTilt: avg((m) => m.shoulderTilt),
    absShoulderTilt: avg((m) => m.absShoulderTilt),
    absHeadRoll: avg((m) => m.absHeadRoll),
    shoulderZSpread: avg((m) => m.shoulderZSpread),
  };
}
