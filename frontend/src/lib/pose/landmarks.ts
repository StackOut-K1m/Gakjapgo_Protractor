// MediaPipe Pose 랜드마크 인덱스와 공용 계산 헬퍼.
// ai/src 의 파이썬 판정 스크립트와 동일한 지표를 계산한다 (수식 1:1 대응).
import type { NormalizedLandmark } from '@mediapipe/tasks-vision';

/** Pose 33개 랜드마크 중 상반신 판정에 쓰는 것들 */
export const LM = {
  NOSE: 0,
  LEFT_EYE_OUTER: 3,
  RIGHT_EYE_OUTER: 6,
  LEFT_EAR: 7,
  RIGHT_EAR: 8,
  MOUTH_LEFT: 9,
  MOUTH_RIGHT: 10,
  LEFT_SHOULDER: 11,
  RIGHT_SHOULDER: 12,
  LEFT_ELBOW: 13,
  RIGHT_ELBOW: 14,
  LEFT_WRIST: 15,
  RIGHT_WRIST: 16,
  // 손끝 쪽 점들. 턱에 닿는 것은 손목이 아니라 이쪽이라 턱 괴기 판정에서 쓴다.
  LEFT_PINKY: 17,
  RIGHT_PINKY: 18,
  LEFT_INDEX: 19,
  RIGHT_INDEX: 20,
} as const;

export interface Point {
  x: number;
  y: number;
}

/** 랜드마크를 픽셀 좌표로 변환 */
export function px(lms: NormalizedLandmark[], idx: number, w: number, h: number): Point {
  return { x: lms[idx].x * w, y: lms[idx].y * h };
}

export function dist(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function mid(a: Point, b: Point): Point {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

/** 두 점을 잇는 선의 수평 대비 각도(도) */
export function angleDeg(from: Point, to: Point): number {
  return (Math.atan2(to.y - from.y, to.x - from.x) * 180) / Math.PI;
}

/**
 * 기울기 각도를 -90~90 으로 정규화한다.
 *
 * MediaPipe 의 LEFT / RIGHT 랜드마크는 "사용자 기준"이라 비반전 영상에서는
 * 왼쪽 랜드마크가 화면 오른쪽에 온다. 이 경우 atan2 가 0도 대신 180도를 돌려주므로
 * 좌우 순서와 무관하게 "수평에서 얼마나 기울었는지"만 남긴다.
 */
export function normalizeTilt(deg: number): number {
  if (deg > 90) return deg - 180;
  if (deg < -90) return deg + 180;
  return deg;
}

export function visibility(lms: NormalizedLandmark[], idx: number): number {
  return lms[idx].visibility ?? 1;
}

/**
 * 프레임마다 반복 계산하는 기본 지표 묶음.
 * 모든 거리는 어깨너비로 정규화한다 → 카메라 거리·해상도와 무관해진다.
 */
export interface PoseMetrics {
  shoulderWidth: number;
  shoulderMid: Point;
  earMid: Point;
  nose: Point;
  /** 머리 좌우 기울기(도). 눈 바깥선 기준 */
  headRoll: number;
  /** 고개 숙임 지표 = (코y - 귀중점y) / 어깨너비. 양수=숙임, 음수=젖힘 */
  headPitch: number;
  /** 어깨 기울기(도) — 좌우 높이차 */
  shoulderTilt: number;
  /** 귀-어깨 세로 간격 / 어깨너비. 어깨를 올리면 줄어든다 */
  earShoulderGap: number;
  earShoulderGapLeft: number;
  earShoulderGapRight: number;
  /** 귀 사이 거리 / 어깨너비. 고개를 돌리면 줄어든다 */
  earWidth: number;
  /** 코의 어깨중점 기준 상대 위치 (어깨너비 정규화) */
  noseRel: Point;
}

/** 랜드마크에서 공통 지표를 한 번에 계산. 어깨가 안 잡히면 null. */
export function computeMetrics(
  lms: NormalizedLandmark[],
  w: number,
  h: number,
): PoseMetrics | null {
  const shL = px(lms, LM.LEFT_SHOULDER, w, h);
  const shR = px(lms, LM.RIGHT_SHOULDER, w, h);
  const shoulderWidth = dist(shL, shR);
  if (shoulderWidth < 1) return null;

  const earL = px(lms, LM.LEFT_EAR, w, h);
  const earR = px(lms, LM.RIGHT_EAR, w, h);
  const earMid = mid(earL, earR);
  const shoulderMid = mid(shL, shR);
  const nose = px(lms, LM.NOSE, w, h);

  return {
    shoulderWidth,
    shoulderMid,
    earMid,
    nose,
    headRoll: normalizeTilt(
      angleDeg(px(lms, LM.RIGHT_EYE_OUTER, w, h), px(lms, LM.LEFT_EYE_OUTER, w, h)),
    ),
    headPitch: (nose.y - earMid.y) / shoulderWidth,
    shoulderTilt: normalizeTilt(angleDeg(shL, shR)),
    earShoulderGap: (shoulderMid.y - earMid.y) / shoulderWidth,
    earShoulderGapLeft: (shL.y - earL.y) / shoulderWidth,
    earShoulderGapRight: (shR.y - earR.y) / shoulderWidth,
    earWidth: dist(earL, earR) / shoulderWidth,
    noseRel: {
      x: (nose.x - shoulderMid.x) / shoulderWidth,
      y: (nose.y - shoulderMid.y) / shoulderWidth,
    },
  };
}

/** 이동평균 — 랜드마크 떨림 완화 (파이썬 SMOOTH_FRAMES 대응) */
export class MovingAverage {
  private readonly buf: number[] = [];
  private readonly size: number;

  // 생성자 파라미터 프로퍼티는 erasableSyntaxOnly 에서 금지되므로 명시적으로 대입한다
  constructor(size: number) {
    this.size = size;
  }

  push(v: number): number {
    this.buf.push(v);
    if (this.buf.length > this.size) this.buf.shift();
    return this.buf.reduce((s, x) => s + x, 0) / this.buf.length;
  }

  clear(): void {
    this.buf.length = 0;
  }
}

/** 캘리브레이션 — 일정 시간 동안 표본을 모아 중앙값을 기준선으로 삼는다 */
export class Calibrator {
  private samples: number[] = [];
  private startedAt: number | null = null;
  private readonly seconds: number;
  baseline: number | null = null;

  constructor(seconds: number) {
    this.seconds = seconds;
  }

  /** 기준선이 정해지면 true. 진행 중이면 남은 시간을 remaining 으로 알려준다 */
  feed(value: number, now: number): { ready: boolean; remaining: number } {
    if (this.baseline !== null) return { ready: true, remaining: 0 };
    this.startedAt ??= now;
    this.samples.push(value);
    const remaining = this.seconds - (now - this.startedAt) / 1000;
    if (remaining <= 0) {
      const sorted = [...this.samples].sort((a, b) => a - b);
      this.baseline = sorted[Math.floor(sorted.length / 2)];
      return { ready: true, remaining: 0 };
    }
    return { ready: false, remaining };
  }

  reset(): void {
    this.samples = [];
    this.startedAt = null;
    this.baseline = null;
  }
}
