// 스트레칭 동작 판정기.
//
// ai/src/neckStrech, ai/src/shoulderStrech 의 파이썬 스크립트를 브라우저로 옮긴 것이다.
// 임계값은 그쪽 상수를 그대로 가져왔다 (수식·상수 1:1 대응).
//
// 공통 설계
//   - 모든 거리는 어깨너비로 정규화한다 → 카메라 거리·해상도와 무관해진다
//   - 판정은 절대값이 아니라 "기준선 대비 편차"로 한다 → 체형·카메라 기울기 보정
//   - 히스테리시스를 둔다: 목표치를 넘겨 1회 인정한 뒤에는 중립으로 돌아와야 다음 회를 센다
//     (그렇지 않으면 경계에서 떨릴 때 카운트가 폭주한다)
import type { NormalizedLandmark } from '@mediapipe/tasks-vision';

import { LM, dist, px } from './landmarks';
import type { Point, PoseMetrics } from './landmarks';

/** 동작 시작 시 잡는 기준 자세 */
export interface StretchBaseline {
  headRoll: number;
  headPitch: number;
  earShoulderGapLeft: number;
  earShoulderGapRight: number;
  earWidth: number;
  noseRel: Point;
}

export interface StretchFrame {
  m: PoseMetrics;
  lms: NormalizedLandmark[];
  w: number;
  h: number;
  /** performance.now() 밀리초 */
  now: number;
  base: StretchBaseline;
  /** 이 동작을 유지해야 하는 시간(초). stretchings.hold_seconds */
  holdSeconds: number;
}

export interface StretchTick {
  /** 완료한 횟수 */
  reps: number;
  /**
   * "아직 세지 않은" 현재 회차의 진행도 0~1.
   *
   * 호출부가 (reps + repProgress) / requiredReps 로 전체 진행률을 만든다.
   * 그래서 1회를 인정한 프레임에서는 반드시 0 으로 돌려줘야 한다.
   * 1 로 돌려주면 그 회차가 두 번 세어져 절반만 해도 100%가 된다.
   */
  repProgress: number;
  /** 화면에 띄울 짧은 안내 */
  hint: string;
}

export interface StretchDetector {
  /** 이 동작을 몇 번 해야 완료인가 */
  requiredReps: number;
  update(f: StretchFrame): StretchTick;
}

/** 랜드마크 신뢰도 하한 (파이썬 VIS_MIN) */
const VIS_MIN = 0.5;

function vis(lms: NormalizedLandmark[], i: number): number {
  return lms[i].visibility ?? 1;
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

// ─────────────────────────────────────────────────────────────
// 좌우 각 1회씩 유지하는 동작을 위한 공통 골격.
// 목 기울이기·대각선·크로스바디·오버헤드가 모두 이 형태다.
//   측정 → 목표 도달 → holdSeconds 유지 → 1회 인정 → 중립 복귀 → 반대쪽
// ─────────────────────────────────────────────────────────────
interface SideHoldSpec {
  /** 이번 프레임에 어느 쪽 동작이 성립하는가. 아니면 null */
  detect(f: StretchFrame): 'LEFT' | 'RIGHT' | null;
  /** 중립으로 돌아왔는가 (다음 회를 세기 위한 조건) */
  isNeutral(f: StretchFrame): boolean;
  /** 목표까지 얼마나 왔는지 0~1. 진행 바에 쓴다 */
  approach(f: StretchFrame): number;
  hintIdle: string;
  hintHold: string;
}

/**
 * 유지 중 순간 끊김 허용 시간 (파이썬 HOLD_GRACE_SECONDS 대응).
 * 랜드마크 떨림으로 한두 프레임 조건에서 벗어나도 유지 타이머를 리셋하지 않는다.
 * 이게 없으면 경계값 근처에서 카운트가 계속 0으로 돌아가 체감 난이도가 급등한다.
 */
const HOLD_GRACE_MS = 800;

function sideHoldDetector(spec: SideHoldSpec): StretchDetector {
  const done = { LEFT: false, RIGHT: false };
  let holdingSide: 'LEFT' | 'RIGHT' | null = null;
  let holdStart = 0;
  let lastHeldAt = 0;
  let needReturn = false;

  return {
    requiredReps: 2,
    update(f) {
      const reps = (done.LEFT ? 1 : 0) + (done.RIGHT ? 1 : 0);
      const side = spec.detect(f);

      // 1회 인정 직후에는 중립으로 돌아와야 다음 회를 센다
      if (needReturn) {
        if (spec.isNeutral(f)) needReturn = false;
        return { reps, repProgress: 0, hint: '천천히 원래 자세로 돌아오세요' };
      }

      if (side === null || done[side]) {
        // 유지 도중의 순간 끊김이면 타이머를 유지한 채 계속 진행으로 본다
        if (
          side === null &&
          holdingSide !== null &&
          !done[holdingSide] &&
          f.now - lastHeldAt <= HOLD_GRACE_MS
        ) {
          const held = (f.now - holdStart) / 1000;
          return {
            reps,
            repProgress: clamp01(held / f.holdSeconds),
            hint: `${spec.hintHold} ${Math.ceil(f.holdSeconds - held)}초`,
          };
        }
        holdingSide = null;
        // 이미 끝낸 쪽을 다시 하고 있으면 진행도로 치지 않는다
        const alreadyDone = side !== null && done[side];
        return {
          reps,
          repProgress: alreadyDone ? 0 : spec.approach(f),
          hint: alreadyDone ? '반대쪽도 해주세요' : spec.hintIdle,
        };
      }

      if (holdingSide !== side) {
        holdingSide = side;
        holdStart = f.now;
      }
      lastHeldAt = f.now;
      const held = (f.now - holdStart) / 1000;
      if (held >= f.holdSeconds) {
        done[side] = true;
        needReturn = true;
        holdingSide = null;
        return {
          reps: reps + 1,
          repProgress: 0,
          hint: '좋습니다! 천천히 돌아오세요',
        };
      }
      return {
        reps,
        repProgress: clamp01(held / f.holdSeconds),
        hint: `${spec.hintHold} ${Math.ceil(f.holdSeconds - held)}초`,
      };
    },
  };
}

// ─────────────────────────────────────────────────────────────
// ① 목 옆으로 기울이기 — neckStrech1.py
// 머리 좌우 기울기(headRoll)가 기준선에서 TILT_TARGET 이상 벗어난 채 유지되면 1회.
// ─────────────────────────────────────────────────────────────
const TILT_TARGET_DEG = 18;
const TILT_RETURN_DEG = 8;

function neckTilt(): StretchDetector {
  return sideHoldDetector({
    detect: (f) => {
      const dev = f.m.headRoll - f.base.headRoll;
      if (Math.abs(dev) < TILT_TARGET_DEG) return null;
      return dev < 0 ? 'LEFT' : 'RIGHT';
    },
    isNeutral: (f) =>
      Math.abs(f.m.headRoll - f.base.headRoll) < TILT_RETURN_DEG,
    approach: (f) =>
      clamp01(Math.abs(f.m.headRoll - f.base.headRoll) / TILT_TARGET_DEG),
    hintIdle: '귀를 어깨 쪽으로 천천히 기울이세요',
    hintHold: '그대로 유지 —',
  });
}

// ─────────────────────────────────────────────────────────────
// ② 목 돌리기 — neckStrech2.py
// 코가 기준 중심에서 R_MIN 이상 벗어난 상태로 한 바퀴 돌면 1회.
// 누적 회전각으로 세고, 중심 근처에 오래 머물면 누적을 리셋한다.
// ─────────────────────────────────────────────────────────────
const ROLL_R_MIN = 0.13;
const ROLL_IDLE_RESET_MS = 1500;
const ROLL_MIN_CYCLE_MS = 2000;

function neckRoll(): StretchDetector {
  let reps = 0;
  let cumDeg = 0;
  let prevAngle: number | null = null;
  let idleSince: number | null = null;
  let cycleStart = 0;

  return {
    requiredReps: 2,
    update(f) {
      const vx = f.m.noseRel.x - f.base.noseRel.x;
      const vy = f.m.noseRel.y - f.base.noseRel.y;
      const r = Math.hypot(vx, vy);

      if (r < ROLL_R_MIN) {
        // 중심 근처 — 잠깐 지나는 건 괜찮지만 오래 머물면 한 바퀴가 끊긴 것으로 본다
        idleSince ??= f.now;
        if (f.now - idleSince > ROLL_IDLE_RESET_MS) {
          cumDeg = 0;
          prevAngle = null;
          cycleStart = 0;
        }
        return {
          reps,
          repProgress: clamp01(Math.abs(cumDeg) / 360),
          hint: '고개로 큰 원을 그려주세요',
        };
      }

      idleSince = null;
      const angle = (Math.atan2(vy, vx) * 180) / Math.PI;
      if (prevAngle === null) {
        prevAngle = angle;
        cycleStart = f.now;
        return { reps, repProgress: 0, hint: '그대로 크게 돌려주세요' };
      }

      // -180/180 경계를 넘을 때 튀지 않도록 최단 경로로 누적한다
      let delta = angle - prevAngle;
      if (delta > 180) delta -= 360;
      if (delta < -180) delta += 360;
      prevAngle = angle;
      cumDeg += delta;

      // 너무 빠르면 팔·머리를 튕긴 것이므로 인정하지 않는다
      if (Math.abs(cumDeg) >= 360) {
        if (f.now - cycleStart >= ROLL_MIN_CYCLE_MS) {
          reps += 1;
          cumDeg = 0;
          cycleStart = f.now;
          return { reps, repProgress: 0, hint: '한 바퀴 완료!' };
        }
        cumDeg = 0;
        cycleStart = f.now;
        return { reps, repProgress: 0, hint: '조금 더 천천히 돌려주세요' };
      }

      return {
        reps,
        repProgress: clamp01(Math.abs(cumDeg) / 360),
        hint: '그대로 크게 돌려주세요',
      };
    },
  };
}

// ─────────────────────────────────────────────────────────────
// ③ 목 대각선 스트레칭 — neckStrech3.py
// 고개를 옆으로 돌리고(귀 간격이 줄어듦) 그 방향으로 숙인 자세를 유지하면 1회.
// ─────────────────────────────────────────────────────────────
const DIAG_X_MIN = 0.1;
const DIAG_Y_MIN = 0.12;
const DIAG_YAW_SHRINK = 0.85;
const DIAG_NEUTRAL_R = 0.08;

function neckDiagonal(): StretchDetector {
  return sideHoldDetector({
    detect: (f) => {
      const dx = f.m.noseRel.x - f.base.noseRel.x;
      const dy = f.m.noseRel.y - f.base.noseRel.y;
      const turned = f.m.earWidth < f.base.earWidth * DIAG_YAW_SHRINK;
      if (!turned || Math.abs(dx) < DIAG_X_MIN || dy < DIAG_Y_MIN) return null;
      return dx < 0 ? 'LEFT' : 'RIGHT';
    },
    isNeutral: (f) =>
      Math.hypot(
        f.m.noseRel.x - f.base.noseRel.x,
        f.m.noseRel.y - f.base.noseRel.y,
      ) < DIAG_NEUTRAL_R,
    approach: (f) => {
      const dx = Math.abs(f.m.noseRel.x - f.base.noseRel.x);
      const dy = Math.max(0, f.m.noseRel.y - f.base.noseRel.y);
      return clamp01(Math.min(dx / DIAG_X_MIN, dy / DIAG_Y_MIN));
    },
    hintIdle: '고개를 45도 돌린 뒤 비스듬히 숙이세요',
    hintHold: '그대로 유지 —',
  });
}

// ─────────────────────────────────────────────────────────────
// 어깨 상승형 공통 — 으쓱하기 / 어깨 돌리기
// 귀-어깨 간격이 줄어든 정도로 어깨가 올라갔는지 본다.
// 고개를 숙여도 간격은 줄어들기 때문에, 머리 각도가 그대로일 때만 인정한다(치팅 방지).
// ─────────────────────────────────────────────────────────────
function shoulderRise(f: StretchFrame): { avg: number; bothOk: (min: number) => boolean } {
  const riseL = f.base.earShoulderGapLeft - f.m.earShoulderGapLeft;
  const riseR = f.base.earShoulderGapRight - f.m.earShoulderGapRight;
  return {
    avg: (riseL + riseR) / 2,
    bothOk: (min) => riseL >= min && riseR >= min,
  };
}

// ③-1 어깨 으쓱하기 — neckStrech4.py
const SHRUG_MIN = 0.08;
const SHRUG_BOTH_MIN = 0.05;
const SHRUG_RETURN_RATIO = 0.4;
const SHRUG_HEAD_STILL_MAX = 0.07;
const SHRUG_REPS = 3;

/** 으쓱 유지 중 순간 끊김 허용 (neckStrech4.py HOLD_GRACE_SECONDS=0.6) */
const SHRUG_GRACE_MS = 600;

function shoulderShrug(): StretchDetector {
  let reps = 0;
  let holdStart: number | null = null;
  let lastOkAt = 0;
  let needReturn = false;

  return {
    requiredReps: SHRUG_REPS,
    update(f) {
      const headStill =
        Math.abs(f.m.headPitch - f.base.headPitch) <= SHRUG_HEAD_STILL_MAX;
      const { avg, bothOk } = shoulderRise(f);

      if (needReturn) {
        if (avg < SHRUG_MIN * SHRUG_RETURN_RATIO) needReturn = false;
        return { reps, repProgress: 0, hint: '힘을 빼고 어깨를 툭 내리세요' };
      }

      const ok = headStill && avg >= SHRUG_MIN && bothOk(SHRUG_BOTH_MIN);
      // 유지 도중 한두 프레임 조건에서 벗어나도 타이머를 리셋하지 않는다
      const inGrace =
        holdStart !== null && f.now - lastOkAt <= SHRUG_GRACE_MS;

      if (ok || inGrace) {
        if (ok) lastOkAt = f.now;
        holdStart ??= f.now;
        const held = (f.now - holdStart) / 1000;
        if (held >= f.holdSeconds) {
          reps += 1;
          needReturn = true;
          holdStart = null;
          return { reps, repProgress: 0, hint: '좋습니다! 어깨를 내리세요' };
        }
        return {
          reps,
          repProgress: clamp01(held / f.holdSeconds),
          hint: `그대로 유지 — ${Math.ceil(f.holdSeconds - held)}초`,
        };
      }

      holdStart = null;
      if (!headStill) {
        return { reps, repProgress: 0, hint: '고개는 그대로 두고 어깨만 올리세요' };
      }
      return {
        reps,
        repProgress: clamp01(avg / SHRUG_MIN),
        hint: '양 어깨를 귀 쪽으로 끌어올리세요',
      };
    },
  };
}

// ③-2 어깨 돌리기 — shoulderStrech3.py
// 돌리는 동안 어깨가 올라갔다 내려오는 사이클을 센다.
const ROLL_RISE_MIN = 0.06;
const ROLL_BOTH_MIN = 0.04;
const ROLL_RETURN_RATIO = 0.4;
const ROLL_HEAD_STILL_MAX = 0.08;
const ROLL_MIN_CYCLE_SEC = 0.8;
const SHOULDER_ROLL_REPS = 3;

function shoulderRoll(): StretchDetector {
  let reps = 0;
  let up = false;
  let cycleStart = 0;
  let peak = 0;

  return {
    requiredReps: SHOULDER_ROLL_REPS,
    update(f) {
      const headStill =
        Math.abs(f.m.headPitch - f.base.headPitch) <= ROLL_HEAD_STILL_MAX;
      const { avg, bothOk } = shoulderRise(f);

      if (!headStill) {
        return { reps, repProgress: peak, hint: '고개는 그대로 두세요' };
      }

      if (!up && avg >= ROLL_RISE_MIN && bothOk(ROLL_BOTH_MIN)) {
        up = true;
        cycleStart = f.now;
        peak = 1;
      } else if (up && avg < ROLL_RISE_MIN * ROLL_RETURN_RATIO) {
        up = false;
        peak = 0;
        // 잔떨림으로 카운트가 튀지 않게 최소 사이클 시간을 둔다
        if ((f.now - cycleStart) / 1000 >= ROLL_MIN_CYCLE_SEC) {
          reps += 1;
          return { reps, repProgress: 0, hint: '한 바퀴 완료!' };
        }
      }
      if (!up) peak = clamp01(avg / ROLL_RISE_MIN);

      return {
        reps,
        repProgress: peak,
        hint: up ? '그대로 뒤로 크게 돌리세요' : '어깨로 큰 원을 그려주세요',
      };
    },
  };
}

// ─────────────────────────────────────────────────────────────
// ④ 크로스바디 — shoulderStrech1.py
// 손목이 반대쪽 어깨를 가로질러 어깨 높이 부근에 머물면 1회.
//
// 파이썬 원본보다 조건을 완화했다. 스터디룸 웹캠은 얼굴 위주 화각이라
// 팔을 뻗으면 손목이 프레임 밖으로 나가거나 몸통에 가려진다.
//   - 높이 허용 범위 0.55 → 0.8 (손목이 가슴~배 높이로 내려가도 인정)
//   - 통과 마진 0 → -0.1 (반대 어깨 직전까지 와도 인정)
// ─────────────────────────────────────────────────────────────
const CROSS_HEIGHT_BAND = 0.8;
const CROSS_MARGIN = -0.1;

/**
 * 팔이 자기 어깨에서 반대쪽으로 이동한 거리. 이 값 미만이면 "뻗지 않았다"로 본다.
 *
 * MediaPipe 는 가려진 손목도 위치를 추정해서 항상 내보낸다. 그래서 통과 마진만 보면
 * 책상에 얹어 둔 반대쪽 손이 조건을 함께 만족해 버린다. 실제로 가로지른 팔은
 * 손목이 자기 어깨에서 멀리 떨어지므로, 그 이동량으로 둘을 구분한다.
 */
const CROSS_TRAVEL_MIN = 0.7;

/** 손목이 반대 어깨를 넘었는지 (넘었으면 그 팔의 방향을 돌려준다) */
function crossedSide(f: StretchFrame): 'LEFT' | 'RIGHT' | null {
  const { lms, w, h, m } = f;
  const shL = px(lms, LM.LEFT_SHOULDER, w, h);
  const shR = px(lms, LM.RIGHT_SHOULDER, w, h);

  /** 조건을 만족하면 진행량(클수록 확실히 가로지른 것), 아니면 null */
  const score = (
    wristIdx: number,
    ownShoulder: Point,
    otherShoulder: Point,
  ): number | null => {
    if (vis(lms, wristIdx) < VIS_MIN) return null;
    const wrist = px(lms, wristIdx, w, h);
    // 어깨 높이에서 크게 벗어나면 다른 동작이다
    if (
      Math.abs(wrist.y - ownShoulder.y) >
      CROSS_HEIGHT_BAND * m.shoulderWidth
    ) {
      return null;
    }
    const towardOther = Math.sign(otherShoulder.x - ownShoulder.x);
    // 자기 어깨에서 반대쪽으로 얼마나 이동했는가 (팔을 실제로 뻗었는지)
    const travel =
      ((wrist.x - ownShoulder.x) * towardOther) / m.shoulderWidth;
    if (travel < CROSS_TRAVEL_MIN) return null;
    // 반대 어깨를 넘어섰는가
    const beyond =
      ((wrist.x - otherShoulder.x) * towardOther) / m.shoulderWidth;
    return beyond > CROSS_MARGIN ? travel : null;
  };

  const left = score(LM.LEFT_WRIST, shL, shR);
  const right = score(LM.RIGHT_WRIST, shR, shL);

  // 둘 다 조건을 만족하면 더 멀리 뻗은 팔을 고른다.
  // 먼저 검사한 쪽을 무조건 돌려주면, 실제로 움직인 팔과 라벨이 어긋나
  // "반대쪽도 해주세요"에서 영원히 진행되지 않는다.
  if (left !== null && right !== null) return left >= right ? 'LEFT' : 'RIGHT';
  if (left !== null) return 'LEFT';
  if (right !== null) return 'RIGHT';
  return null;
}

function crossBody(): StretchDetector {
  return sideHoldDetector({
    detect: crossedSide,
    isNeutral: (f) => crossedSide(f) === null,
    approach: (f) => (crossedSide(f) ? 1 : 0),
    hintIdle: '한쪽 팔을 반대편 어깨 쪽으로 당기세요',
    hintHold: '그대로 유지 —',
  });
}

// ─────────────────────────────────────────────────────────────
// 이름 → 판정기 매핑.
// 키는 stretchings.name (schema.sql 시드와 같아야 한다).
// 등록되지 않은 이름이면 판정기가 없다는 뜻이므로 null 을 돌려준다.
// ─────────────────────────────────────────────────────────────
const DETECTORS: Record<string, () => StretchDetector> = {
  '목 옆으로 기울이기': neckTilt,
  '목 돌리기': neckRoll,
  '목 대각선 스트레칭': neckDiagonal,
  '어깨 으쓱하기': shoulderShrug,
  '어깨 돌리기': shoulderRoll,
  '크로스바디 스트레칭': crossBody,
};

/** 동작 이름으로 판정기를 만든다. 판정기가 없는 동작이면 null. */
export function createStretchDetector(name: string): StretchDetector | null {
  const make = DETECTORS[name];
  return make ? make() : null;
}

/** 이 동작에 판정기가 있는지 */
export function hasStretchDetector(name: string): boolean {
  return name in DETECTORS;
}

/** 프레임 표본들에서 기준 자세를 만든다 (중앙값 — 튄 프레임에 끌려가지 않게) */
export function buildStretchBaseline(samples: PoseMetrics[]): StretchBaseline {
  const med = (pick: (m: PoseMetrics) => number) => {
    const sorted = samples.map(pick).sort((a, b) => a - b);
    const i = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0 ? (sorted[i - 1] + sorted[i]) / 2 : sorted[i];
  };
  return {
    headRoll: med((m) => m.headRoll),
    headPitch: med((m) => m.headPitch),
    earShoulderGapLeft: med((m) => m.earShoulderGapLeft),
    earShoulderGapRight: med((m) => m.earShoulderGapRight),
    earWidth: med((m) => m.earWidth),
    noseRel: { x: med((m) => m.noseRel.x), y: med((m) => m.noseRel.y) },
  };
}

// dist 는 위 판정기들이 직접 쓰진 않지만, 재export 해두면 새 판정기를 추가할 때 편하다
export { dist };
