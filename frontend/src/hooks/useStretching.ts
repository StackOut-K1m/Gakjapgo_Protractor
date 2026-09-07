// src/hooks/useStretching.ts
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  completeStretching,
  skipStretching,
  startStretching,
} from '@/api/stretchingApi';
import {
  MAX_STRETCHING_ATTEMPTS,
  PENALTY_COUNTDOWN_SECONDS,
  STRETCHING_STEPS,
} from '@/types/stretching';
import type { PostureBaseline } from '@/types/posture';
import type {
  StepState,
  StretchingPhase,
  StretchingState,
  StretchingStep,
} from '@/types/stretching';

const FAILURE_HINT =
  '카메라 앵글을 확인하고 전신 또는 어깨라인이 보이도록 위치해주세요.';

/**
 * 판정기가 없는 동작을 위한 대체 진행 속도.
 * 7종 시드 동작에는 모두 판정기가 있으므로 평소에는 쓰이지 않는다.
 * (알 수 없는 동작이 들어와도 화면이 막히지 않게 하는 안전장치)
 */
const DEMO_TICK_MS = 250;
const DEMO_STEP_PER_TICK = 3;

/** 실제 판정에서 이 시간 안에 못 끝내면 실패로 본다 */
const MOTION_LIMIT_SECONDS = 90;

interface UseStretchingOptions {
  open: boolean;
  /** 스트레칭을 끝내고 스터디룸으로 돌아갈 때 */
  onReturn: () => void;
  /**
   * 기록을 남길 세션. null 이면 화면만 돌리고 서버에는 남기지 않는다.
   *
   * 자정을 넘겨 기록이 갈리면 이 값이 새 id 로 바뀐다 — 전송 시점의 최신 값을 읽어야 한다.
   */
  sessionId?: number | null;
  /** 지금 수행하는 스트레칭 가이드 id. null 이면 기록하지 않는다(기본 루틴은 서버에 없는 동작이다) */
  stretchingId?: number | null;
  /**
   * 수행할 동작 목록. 서버에서 뽑은 가이드를 넘긴다.
   * 조회 전이거나 실패하면 기본 루틴을 쓴다.
   */
  steps?: StretchingStep[];
  /** 개인 기준선. 실린 값이 맞는지 확인용으로 로그를 남긴다 */
  baseline?: PostureBaseline | null;
  /**
   * 실시간 판정 진행률(0~100). 판정기가 붙은 동작이면 이 값이 들어오고,
   * null 이면 대체 타이머로 진행한다.
   */
  detectedProgress?: number | null;
}

export function useStretching({
  open,
  onReturn,
  sessionId = null,
  stretchingId = null,
  steps = STRETCHING_STEPS,
  baseline = null,
  detectedProgress = null,
}: UseStretchingOptions) {
  const [phase, setPhase] = useState<StretchingPhase>('motion');
  const [progressPercent, setProgressPercent] = useState(0);
  const [attemptsUsed, setAttemptsUsed] = useState(0);
  const [penaltyCountdown, setPenaltyCountdown] = useState(
    PENALTY_COUNTDOWN_SECONDS,
  );

  // 렌더 중에 ref 를 건드리면 안 되므로 갱신은 효과에서 한다.
  const targetRef = useRef({ sessionId, stretchingId });
  useEffect(() => {
    targetRef.current = { sessionId, stretchingId };
  }, [sessionId, stretchingId]);

  /**
   * 서버에 만들어 둔 스트레칭 이벤트 id. 완료율을 채울 때 쓴다.
   *
   * 한 번 열릴 때 한 행이다 — 재도전(최대 3회)은 같은 스트레칭의 재시도라 새로 만들지 않는다.
   * 그래야 리포트의 시도 횟수가 "스트레칭을 시킨 횟수"가 되고, 완료 횟수와 나눠 이행률이 된다.
   */
  const eventIdRef = useRef<number | null>(null);
  /** 결과를 이미 보냈는지. 완료·건너뛰기가 두 번 나가지 않게 막는다 */
  const settledRef = useRef(false);

  // 열릴 때마다 초기화
  useEffect(() => {
    if (!open) return;
    setPhase('motion');
    setProgressPercent(0);
    setAttemptsUsed(0);

    // 기준선이 있어야 개인 체형에 맞춰 동작을 판정할 수 있다.
    // 판정 연동 전이라도 기준선이 실제로 실려 오는지는 여기서 확인할 수 있다.
    if (baseline) {
      console.info(
        `[stretching] 기준선 적용 (${baseline.version}, 표본 ${baseline.sampleCount}프레임)`,
      );
    } else {
      console.warn(
        '[stretching] 기준선 없이 진행합니다 — 개인 체형 보정이 되지 않습니다',
      );
    }
  }, [open, baseline]);

  /**
   * 열릴 때 서버에 "이 스트레칭을 시켰다"를 남긴다. 이 행 하나가 시도 1회다.
   *
   * 실패해도 화면은 그대로 진행한다 — 기록을 못 남기는 것과 스트레칭을 못 하는 것은 다르다.
   * 그러면 eventIdRef 가 null 로 남아 완료율도 못 보내는데, 그때는 건너뛰기 쪽 입구가
   * 시작 행을 새로 만들어 최소한 시도 1회는 남는다(백엔드 skip 참고).
   */
  useEffect(() => {
    if (!open) return;
    const { sessionId: id, stretchingId: guideId } = targetRef.current;
    eventIdRef.current = null;
    settledRef.current = false;
    if (id === null || guideId === null) return;

    let cancelled = false;
    startStretching(id, guideId)
      .then((event) => {
        if (!cancelled) eventIdRef.current = event.eventId;
      })
      .catch((e) => {
        console.warn('[stretching] 시작을 기록하지 못했습니다', e);
      });
    return () => {
      cancelled = true;
    };
  }, [open, stretchingId]);

  // 완료 — 진행률 100% 로 닫는다
  useEffect(() => {
    if (phase !== 'complete' || settledRef.current) return;
    settledRef.current = true;
    const eventId = eventIdRef.current;
    if (eventId === null) return;
    completeStretching(eventId, { completionRate: 100 }).catch((e) => {
      console.warn('[stretching] 완료를 기록하지 못했습니다', e);
    });
  }, [phase]);

  // 건너뛰기 — 시도는 남고 완료는 올라가지 않는다
  useEffect(() => {
    if (phase !== 'penalty' || settledRef.current) return;
    settledRef.current = true;
    const { sessionId: id, stretchingId: guideId } = targetRef.current;
    if (id === null || guideId === null) return;
    skipStretching(id, guideId).catch((e) => {
      console.warn('[stretching] 건너뛰기를 기록하지 못했습니다', e);
    });
  }, [phase]);

  // 실시간 판정이 붙은 동작 — 판정기가 올려주는 진행률을 그대로 쓴다
  useEffect(() => {
    if (!open || phase !== 'motion' || detectedProgress === null) return;
    setProgressPercent(detectedProgress);
    if (detectedProgress >= 100) setPhase('complete');
  }, [open, phase, detectedProgress]);

  // 제한 시간 — 아무리 해도 동작이 인식되지 않으면 실패로 넘겨 재도전/패스를 고르게 한다
  useEffect(() => {
    if (!open || phase !== 'motion' || detectedProgress === null) return;
    const id = setTimeout(() => {
      setAttemptsUsed((a) => a + 1);
      setPhase('failed');
    }, MOTION_LIMIT_SECONDS * 1000);
    return () => clearTimeout(id);
    // detectedProgress 는 매 프레임 바뀌므로 의존성에서 뺀다.
    // 넣으면 타이머가 계속 리셋되어 제한 시간이 동작하지 않는다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, phase, attemptsUsed, detectedProgress === null]);

  // 판정기가 없는 동작을 위한 대체 진행 (화면이 막히지 않게 하는 안전장치)
  useEffect(() => {
    if (!open || phase !== 'motion' || detectedProgress !== null) return;
    const id = setInterval(() => {
      setProgressPercent((p) => {
        const next = Math.min(p + DEMO_STEP_PER_TICK, 100);
        if (next >= 100) setPhase('complete');
        return next;
      });
    }, DEMO_TICK_MS);
    return () => clearInterval(id);
  }, [open, phase, detectedProgress]);

  // 패널티 카운트다운
  useEffect(() => {
    if (phase !== 'penalty') return;
    setPenaltyCountdown(PENALTY_COUNTDOWN_SECONDS);

    const id = setInterval(() => {
      setPenaltyCountdown((s) => {
        if (s <= 1) {
          clearInterval(id);
          onReturn();
          return 0;
        }
        return s - 1;
      });
    }, 1000);

    return () => clearInterval(id);
  }, [phase, onReturn]);

  const retry = useCallback(() => {
    if (attemptsUsed >= MAX_STRETCHING_ATTEMPTS) {
      setPhase('penalty');
      return;
    }
    setProgressPercent(0);
    setPhase('motion');
  }, [attemptsUsed]);

  const pass = useCallback(() => {
    setPhase('penalty');
  }, []);

  // 진행률에서 단계 상태를 계산한다
  const state = useMemo<StretchingState>(() => {
    const total = steps.length;
    const perStep = 100 / total;
    const currentStepIndex = Math.min(
      Math.floor(progressPercent / perStep),
      total - 1,
    );

    const stepStates: StepState[] = steps.map((_, i) => {
      if (phase === 'complete') return 'done';
      if (i < currentStepIndex) return 'done';
      if (i === currentStepIndex) {
        return phase === 'failed' ? 'failed' : 'active';
      }
      return 'pending';
    });

    return {
      phase,
      steps,
      stepStates,
      currentStepIndex,
      progressPercent: phase === 'complete' ? 100 : Math.round(progressPercent),
      attemptsUsed,
      maxAttempts: MAX_STRETCHING_ATTEMPTS,
      penaltyCountdown,
      failureHint: FAILURE_HINT,
    };
  }, [phase, progressPercent, attemptsUsed, penaltyCountdown, steps]);

  return { state, retry, pass, returnToRoom: onReturn };
}
