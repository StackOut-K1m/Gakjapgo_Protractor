// src/types/stretching.ts

export type StretchingPhase = 'motion' | 'complete' | 'failed' | 'penalty';

export type StepState = 'pending' | 'active' | 'done' | 'failed';

export interface StretchingStep {
  id: string;
  /** 목록에 표시할 이름 */
  label: string;
  /** 비디오 위에 띄울 동작 안내 */
  guide: string;
  /** 이 자세를 유지해야 하는 시간(초) */
  holdSeconds: number;
}

/** 감지 부위 — events.body_part 와 stretchings.target_part 가 쓰는 값 */
export type TargetPart = 'NECK' | 'SHOULDER' | 'BACK';

/** 서버가 내려주는 스트레칭 가이드 (GET /stretchings) */
export interface Stretching {
  stretchingId: number;
  name: string;
  targetPart: string;
  guideText: string;
  /** 강조할 MediaPipe 랜드마크 이름 배열이 JSON 문자열로 온다 */
  highlightLandmarks: string | null;
  holdSeconds: number;
  sortOrder: number;
}

/** 스트레칭 이벤트 응답 (start / complete / skip 공통) */
export interface StretchingEvent {
  eventId: number;
  studyRecordId: number;
  stretchingId: number;
  status: 'STARTED' | 'COMPLETED' | 'SKIPPED';
  completionRate: number | null;
  startedAt: string;
  endedAt: string | null;
  durationSeconds: number | null;
}

/** PATCH /stretching-events/{eventId} 요청 */
export interface StretchingCompleteRequest {
  /** 0~100 */
  completionRate: number;
  /** 비우면 서버 현재 시각 사용 */
  completedAt?: string;
}

/** 경고 배너에 쓸 부위 이름 — "OO 자세가 N회 감지되었습니다" */
export const TRIGGER_LABEL: Record<string, string> = {
  NECK: '거북목',
  // SHOULDER 부위에 걸리는 판정은 SHOULDER_TILT 하나다(StudyRoomPage 의 POSTURE_TYPE_TO_PART).
  SHOULDER: '어깨 기울어짐',
  // BACK 자리는 공부방에서 턱 괴기가 쓴다. stretchings.target_part 값 자체는 그대로라
  // 서버·DB 는 건드리지 않는다.
  BACK: '턱 괴기',
};

/**
 * 누적 감지 횟수를 셀 때 쓰는 부위 이름.
 *
 * <p>
 * 위 TRIGGER_LABEL 과 다르다. 그쪽은 스트레칭이 시작된 이유를 문장으로 알리는 자리고,
 * 여기는 컨트롤바·PiP 창의 카운터 이름이다. 같은 카운터를 두 화면이 다르게 부르면 같은
 * 값인지 알 수 없으므로 이 값은 한 곳에 둔다.
 *
 * <p>
 * BACK 은 원래 라운드숄더였고 지금은 턱 괴기가 쓴다. 그 자세는 판정에서 빠졌다
 * (사람마다 지표 방향이 반대라 임계값을 정할 수 없었다 — types/posture.ts 주석 참고).
 */
export const DETECT_PART_LABEL: Record<TargetPart, string> = {
  NECK: '거북목',
  BACK: '턱 괴기',
  SHOULDER: '어깨 높낮이',
};

/**
 * 카운터를 늘어놓는 순서.
 *
 * 컨트롤바와 작은 창(PiP)이 같은 순서여야 한다 — 같은 값 세 개를 다른 순서로 늘어놓으면
 * 두 화면을 번갈아 볼 때 숫자를 엉뚱한 부위로 읽게 된다.
 */
export const DETECT_PART_ORDER: TargetPart[] = ['NECK', 'BACK', 'SHOULDER'];

/**
 * 카운터의 시작값.
 *
 * 화면(StudyRoomPage)이 아니라 여기 두는 이유는 카운트를 보관하는 곳이 입장 스토어이기
 * 때문이다(useRoomEntryStore). 스토어와 화면이 각자 0 을 적어 두면 부위가 하나 늘었을 때
 * 한쪽만 고치게 된다.
 */
export const INITIAL_DETECT_COUNTS: Record<TargetPart, number> = {
  NECK: 0,
  SHOULDER: 0,
  BACK: 0,
};

/** 부위별 교정 안내 — PiP 창의 "바르게 앉아주세요" 문구가 된다 */
export const DETECT_PART_ADVICE: Record<TargetPart, string> = {
  NECK: '턱을 살짝 당기고 목을 곧게 세워 바르게 앉아주세요.',
  BACK: '턱을 괸 손을 내리고 바르게 앉아주세요.',
  SHOULDER: '양쪽 어깨 높이를 맞추고 바르게 앉아주세요.',
};

/** 서버 가이드 하나를 화면이 쓰는 단계 형태로 바꾼다 */
export function toStep(stretching: Stretching): StretchingStep {
  return {
    id: `stretching-${stretching.stretchingId}`,
    label: stretching.name,
    guide: stretching.guideText,
    holdSeconds: stretching.holdSeconds,
  };
}

/**
 * 등록된 가이드 중 하나를 무작위로 고른다.
 *
 * 나쁜 자세가 감지되면 그 부위(targetPart)에 맞는 동작만 후보로 삼는다.
 * 부위를 지정하지 않거나 해당 부위 동작이 없으면 전체에서 고른다.
 */
export function pickRandomStretching(
  list: Stretching[],
  targetPart?: string | null,
): Stretching | null {
  if (list.length === 0) return null;
  const matched = targetPart
    ? list.filter((s) => s.targetPart === targetPart)
    : [];
  const pool = matched.length > 0 ? matched : list;
  return pool[Math.floor(Math.random() * pool.length)];
}

/** 서버 조회 실패 시 쓰는 기본 루틴 */
export const STRETCHING_STEPS: StretchingStep[] = [
  {
    id: 'stretch-arms',
    label: '기지개 켜기',
    guide: '양팔을 위로 뻗어 5초간 유지하세요.',
    holdSeconds: 5,
  },
  {
    id: 'neck-tilt',
    label: '목 좌우 당기기',
    guide: '목을 왼쪽으로 지긋이 기울여서 5초간 유지하세요.',
    holdSeconds: 5,
  },
  {
    id: 'shoulder-roll',
    label: '어깨 회전',
    guide: '어깨를 뒤로 크게 5회 돌려주세요.',
    holdSeconds: 5,
  },
];

/** 스트레칭 기회 횟수 */
export const MAX_STRETCHING_ATTEMPTS = 3;

/** 패널티 화면에서 자동 복귀까지 남은 시간(초) */
export const PENALTY_COUNTDOWN_SECONDS = 5;

export interface StretchingState {
  phase: StretchingPhase;
  steps: StretchingStep[];
  stepStates: StepState[];
  currentStepIndex: number;
  /** 0~100 */
  progressPercent: number;
  attemptsUsed: number;
  maxAttempts: number;
  penaltyCountdown: number;
  /** 실패 시 화면에 띄울 원인 안내 */
  failureHint: string;
}
