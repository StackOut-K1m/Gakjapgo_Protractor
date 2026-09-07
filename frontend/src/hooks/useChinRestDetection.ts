// src/hooks/useChinRestDetection.ts
import { useCallback, useEffect, useRef, useState } from 'react';
import type { NormalizedLandmark } from '@mediapipe/tasks-vision';

import { sendPostureCheck } from '@/api/postureApi';
import {
  isChinRestFrame,
  measureChinRest,
  type ChinRestBlockedReason,
  type ChinRestSample,
} from '@/lib/pose/chinRest';

/**
 * 이만큼 이어져야 경고. 서버 판정 2종의 관찰 구간(app.posture.window-seconds)과 같은 값이다.
 *
 * 3초 → 30초 → 10초로 옮겨 왔다. 3초는 잠깐 얼굴을 만지는 것까지 걸려 경고가 너무 쉽게
 * 떴고, 30초는 반대로 다 괴고 난 뒤에야 왔다. 10초면 "잠깐 손을 올렸다"는 안 걸리면서
 * 습관적으로 괴고 있으면 곧바로 잡힌다.
 *
 * 신호등의 "경고 N/10초"가 거북목·어깨 줄과 같은 눈금이 되어 화면에서 비교된다.
 *
 * <b>경고 주기이기도 하다.</b> 손을 내리지 않으면 이 시간마다 다시 경고한다 — 서버의
 * 지속 알림(PostureWindowTracker 의 SUSTAINED)과 같은 규칙이다.
 *
 * 신호등이 다음 경고까지 남은 시간을 보여주므로 화면 쪽에서도 이 값을 안다.
 */
export const CHIN_REST_HOLD_SECONDS = 10;

/**
 * 손이 이만큼 떨어져 있으면 누적을 끊는다.
 *
 * 10초를 <b>연속으로</b> 요구하면 확정되지 않는다. 초당 30번 판정하는데 손이 살짝 움직이거나
 * 랜드마크가 한두 프레임 튀기만 해도 후보가 아닌 프레임이 끼고, 그때마다 처음부터 다시 세면
 * 10초를 채울 수가 없다. 서버가 관찰 구간에 risk-ratio 0.8을 두는 것과 같은 이유다.
 *
 * 그래서 이 시간 안에 손이 돌아오면 누적을 이어 간다. 확정된 뒤의 해제 판정도 같은 값을 쓴다.
 *
 * 밖으로 내보내는 이유는 코칭 화면이 언제 닫히는지를 세는 쪽(StudyRoomPage)에서 필요해서다.
 * 서버 자세의 회복(2초)과 값이 달라 따로 알아야 한다.
 */
export const CHIN_REST_RELEASE_SECONDS = 1;

/**
 * 프레임이 이만큼 끊기면 측정이 멈춘 것으로 본다(스트레칭·쉬는 시간·탭 전환·연결 끊김).
 *
 * 서버 판정의 app.posture.gap-seconds 와 같은 값이다. 두 판정이 서로 다른 기준으로 끊으면
 * 같은 시간대를 한쪽만 나쁜 자세로 세게 된다.
 */
const CHIN_REST_GAP_SECONDS = 5;

export interface ChinRestState {
  /** 지금 턱을 괴고 있다고 확정된 상태 */
  active: boolean;
  /** 손은 턱에 있지만 아직 지속 시간을 못 채운 상태 */
  holding: boolean;
  /**
   * 지금 세고 있는 창의 경과 초(정수). 괴고 있지 않으면 0.
   *
   * 신호등이 "경고 4/10초"처럼 <b>다음 경고까지</b> 남은 시간을 보여주는 데 쓴다.
   * 서버 판정 2종이 관찰 구간을 그렇게 보여주고 있어 같은 방식으로 맞춘다.
   *
   * 경고가 나가면 0 으로 돌아간다 — 괴기가 이어지는 동안 이 시간마다 다시 경고하기 때문이다.
   * 괴기 시작부터 누적한 값이 아니므로 한 구간 안에서 여러 번 0 → 10 을 오간다.
   *
   * 유예(RELEASE_SECONDS) 중에도 누적은 살아 있으므로 손이 잠깐 흔들려서는 0 이 되지 않는다.
   */
  holdingSeconds: number;
  /**
   * 못 재고 있는 이유. null 이면 정상적으로 재는 중이다.
   *
   * 예전에는 이 자리에 handMissing(boolean) 하나만 있어서, 얼굴이 가려진 것도 영상 크기를
   * 못 읽은 것도 전부 "손이 안 보임"으로 나왔다. 원인이 다르면 사용자가 할 일도 다르다.
   */
  blockedReason: ChinRestBlockedReason | null;
  /**
   * 이 세션에서 경고가 나간 횟수. 경고 카운트(detectCounts)와 달리 스트레칭 후에도 초기화되지 않는다.
   * 종료 화면의 "실시간 자세 교정 알림"에 자세 3종과 함께 합산된다.
   *
   * 구간 수가 아니라 <b>경고 수</b>다. 한 번 괴고 90초를 버티면 3이 된다 — 서버 자세의
   * confirmedCount 도 지속 알림을 같이 세므로(usePostureFrames) 두 값의 뜻이 같다.
   */
  confirmedCount: number;
  /** 확정된 괴기의 지속 시간 합(초). 종료 화면의 "나쁜 자세" 시간에 더한다 */
  badSeconds: number;
  /**
   * 손이 턱에서 떨어지기 시작한 시각(ms). 괴는 중이거나 이미 해제됐으면 null.
   *
   * 여기서 CHIN_REST_RELEASE_SECONDS 가 지나면 해제된다. 코칭 화면이 언제 닫히는지를
   * 세는 쪽이 서버 자세(2초)와 이 값(1초)을 함께 보고 늦게 끝나는 쪽에 맞춘다.
   */
  releasingSince: number | null;
}

const INITIAL: ChinRestState = {
  active: false,
  holding: false,
  holdingSeconds: 0,
  blockedReason: null,
  confirmedCount: 0,
  badSeconds: 0,
  releasingSince: null,
};

/**
 * 턱 괴기 감지.
 *
 * <p>서버로 보내지 않고 브라우저에서 판정한다. 공부방의 경고 → 스트레칭 루프가 이미 전부
 * 프론트에서 돌고 있고(detectCounts 로컬 카운터), 손목·팔꿈치는 서버 계약(PostureFeatures v1)에
 * 들어 있지 않기 때문이다. v1 은 동결돼 있어 필드를 늘리면 기존 캘리브레이션이 무효가 된다.
 *
 * <p>랜드마커는 싱글턴이라 이 훅이 자기 루프를 돌리면 안 된다. 그래서 스트림을 직접 열지 않고
 * onFrame 을 밖으로 내보내, 이미 돌고 있는 루프(usePostureFrames)가 대신 먹여 주게 했다.
 */
/**
 * 서버가 받는 LocalDateTime 형식(YYYY-MM-DDTHH:mm:ss)으로 만든다.
 *
 * toISOString() 을 쓰면 안 된다. UTC 로 바뀌면서 한국 시간과 9시간 어긋나고, 끝에 붙는 Z 때문에
 * 서버의 LocalDateTime 파싱도 실패한다.
 */
function toLocalDateTime(ms: number): string {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
  );
}

interface UseChinRestOptions {
  /** 이벤트를 기록할 세션. null 이면 판정만 하고 서버에는 보내지 않는다 */
  sessionId?: number | null;
  /**
   * 새로 확정될 때마다 한 번 불린다. 경고 카운트를 올리는 자리다.
   *
   * 값을 내보내고 밖에서 효과로 증가분을 세는 대신 콜백으로 알린다. 그쪽은 효과 안에서
   * setState 를 하게 되는데, 프로젝트 린트 규칙(react-hooks/set-state-in-effect)이 막는다.
   */
  onConfirmed?: () => void;
}

export function useChinRestDetection({
  sessionId = null,
  onConfirmed,
}: UseChinRestOptions = {}): ChinRestState & {
  onFrame: (
    lms: NormalizedLandmark[] | null,
    width: number,
    height: number,
  ) => void;
  flushNow: () => Promise<void>;
} {
  const [state, setState] = useState<ChinRestState>(INITIAL);
  // 렌더 중에 ref 를 건드리면 안 되므로 갱신은 효과에서 한다(usePoseStream 과 같은 방식).
  const onConfirmedRef = useRef(onConfirmed);
  const sessionIdRef = useRef(sessionId);
  useEffect(() => {
    onConfirmedRef.current = onConfirmed;
    sessionIdRef.current = sessionId;
  }, [onConfirmed, sessionId]);

  /** 지금 이어지고 있는 괴기가 시작된 시각. 끝날 때 이 값으로 이벤트 한 건을 남긴다 */
  const episodeStart = useRef<number | null>(null);

  /**
   * 마지막으로 프레임을 받은 시각. 측정이 끊긴 구간을 찾고, 끊긴 뒤 이벤트를 닫을 기준이 된다.
   *
   * 이 값 없이 "지금"으로 닫으면 아무도 보지 않은 시간까지 턱 괴기로 남는다.
   */
  const lastFrameAt = useRef<number | null>(null);

  // 초당 30회 불리는 자리라 프레임마다 setState 를 하면 안 된다.
  // 지속 판정은 ref 로 굴리고, 확정·해제로 값이 실제 바뀔 때만 setState 한다.
  const activeRef = useRef(false);
  const candidateSince = useRef<number | null>(null);
  const clearSince = useRef<number | null>(null);
  /**
   * 지금 세고 있는 창이 시작된 시각. 경고를 낼 때마다 여기서 다시 시작한다.
   *
   * candidateSince 와 따로 두는 이유는 둘이 세는 것이 다르기 때문이다. candidateSince 는
   * 손이 턱에 닿은 순간이고 구간 하나 동안 바뀌지 않는다(이벤트의 시작 시각). 이 값은
   * 경고 주기라서 이 시간마다 갱신된다. 하나로 합치면 이벤트에 기록되는 지속 시간이 마지막
   * 경고 이후로만 잘린다.
   */
  const windowStart = useRef<number | null>(null);
  const holdingRef = useRef(false);
  const holdingSecondsRef = useRef(0);
  const blockedReasonRef = useRef<ChinRestBlockedReason | null>(null);
  const releasingSinceRef = useRef<number | null>(null);

  const flush = useCallback((endedAtMs: number): Promise<void> => {
    const startedAtMs = episodeStart.current;
    const id = sessionIdRef.current;
    episodeStart.current = null;
    if (startedAtMs === null || id === null) return Promise.resolve();

    const durationSeconds = Math.max(
      1,
      Math.round((endedAtMs - startedAtMs) / 1000),
    );
    // 종료 화면이 쓰는 누적치. 서버 저장과 별개로 화면에서 바로 보여야 한다.
    setState((prev) => ({
      ...prev,
      badSeconds: prev.badSeconds + durationSeconds,
    }));
    return sendPostureCheck(id, {
      detail: 'CHIN_REST',
      bodyPart: 'NECK',
      startedAt: toLocalDateTime(startedAtMs),
      endedAt: toLocalDateTime(endedAtMs),
      durationSeconds,
      // 서버 경고 기준(alert-severity 4)과 맞춘다. 이분 판정이라 정도를 더 나눌 근거가 없다.
      severity: 4,
      alertChannel: 'VISUAL',
    }).catch((e) => {
      // 기록을 못 남겨도 공부는 이어져야 한다. 화면 경고는 이미 떴다.
      console.warn('[chin-rest] 이벤트를 저장하지 못했습니다', e);
    });
  }, []);

  /**
   * 진행 중인 괴기를 지금 끊어 서버로 보낸다.
   *
   * 세션 종료 직전에 <b>await 해서</b> 호출해야 한다. 서버는 종료 시점에 저장된 이벤트를
   * 집계하는데, 나가는 순간까지 괴고 있던 건은 아직 안 보냈기 때문에 그냥 두면 빠진다.
   */
  const flushNow = useCallback(() => {
    if (!activeRef.current) return Promise.resolve();
    activeRef.current = false;
    // 지금이 아니라 마지막으로 본 프레임 시각에서 끊는다. 카메라를 끄거나 스트레칭을 하다가
    // 나가면 그 사이는 측정하지 못한 시간이라, 지금으로 닫으면 그만큼이 턱 괴기로 늘어난다.
    return flush(lastFrameAt.current ?? Date.now());
  }, [flush]);

  // 창을 닫는 등 종료 경로를 안 타는 경우의 대비. 이쪽은 기다려 줄 수 없어 던지기만 한다.
  useEffect(
    () => () => {
      if (activeRef.current) void flush(lastFrameAt.current ?? Date.now());
    },
    [flush],
  );

  const onFrame = useCallback(
    (lms: NormalizedLandmark[] | null, width: number, height: number) => {
      const now = Date.now();

      // 프레임이 한동안 끊겼다 다시 온 것이라면, 끊기기 직전에 진행 중이던 괴기를 그 시각에서 끊는다.
      //
      // 이 판정은 usePostureFrames 가 넘겨주는 랜드마크로만 돈다. 스트레칭·쉬는 시간에는 그쪽이
      // 멈추므로 여기도 함께 멈추는데, 진행 중이던 괴기를 그대로 두면 그 시간이 통째로 지속 시간에
      // 들어간다(실제로 20분짜리 턱 괴기 이벤트가 저장된 적이 있다 — 대부분이 쉬는 시간이었다).
      // 서버 판정도 같은 이유로 같은 처리를 한다(PostureWindowTracker.markFrameAndDetectGap).
      const previousFrameAt = lastFrameAt.current;
      lastFrameAt.current = now;
      if (
        previousFrameAt !== null &&
        now - previousFrameAt > CHIN_REST_GAP_SECONDS * 1000
      ) {
        candidateSince.current = null;
        // 경고 창도 함께 비운다. 남겨 두면 끊기기 전 창 기준으로 복귀 직후 경고가 나간다 —
        // 측정하지 못한 시간을 근거로 경고하지 않는다는 원칙은 창에도 적용된다.
        windowStart.current = null;
        clearSince.current = null;
        if (activeRef.current) {
          activeRef.current = false;
          flush(previousFrameAt);
        }
      }

      const measured = lms ? measureChinRest(lms, width, height) : null;
      const sample: ChinRestSample | null =
        measured?.ok === true ? measured.sample : null;
      const candidate = isChinRestFrame(sample, activeRef.current);

      // 사람 자체가 안 잡힌 프레임은 이유를 말하지 않는다 — 그건 자리비움이고,
      // usePostureFrames 가 따로 센다.
      const blockedReason =
        measured !== null && measured.ok === false ? measured.reason : null;

      if (candidate) {
        // 손이 돌아왔으니 끊길 뻔한 누적을 되살린다.
        clearSince.current = null;
        candidateSince.current ??= now;
        windowStart.current ??= now;
      } else if (candidateSince.current !== null) {
        // 손이 떨어졌다. 바로 끊지 않고 CHIN_REST_RELEASE_SECONDS 만큼 기다린다 —
        // 그러지 않으면 랜드마크가 한두 프레임 튈 때마다 누적이 0으로 돌아가 10초를 못 채운다.
        clearSince.current ??= now;
        if (now - clearSince.current >= CHIN_REST_RELEASE_SECONDS * 1000) {
          // 손을 뗀 시각은 해제가 확정된 지금이 아니라 떨어지기 시작한 때다.
          const releasedAt = clearSince.current;
          candidateSince.current = null;
          windowStart.current = null;
          clearSince.current = null;
          if (activeRef.current) {
            activeRef.current = false;
            flush(releasedAt);
          }
        }
      }

      let confirmed = false;
      if (
        windowStart.current !== null &&
        now - windowStart.current >= CHIN_REST_HOLD_SECONDS * 1000
      ) {
        // 창을 지금부터 다시 센다. 손을 안 내리고 계속 괴고 있으면 이 시간마다 또 경고한다 —
        // 서버 자세 판정의 지속 알림(PostureWindowTracker 의 SUSTAINED)과 같은 규칙이다.
        // 한 번 경고하고 마는 것으로는 계속 괴고 있는 사람에게 알릴 방법이 없다.
        windowStart.current = now;
        confirmed = true;
        if (!activeRef.current) {
          activeRef.current = true;
          // 이벤트는 구간 하나에 한 건이다(SUSTAINED 는 새 행을 열지 않는 서버와 같다).
          // 확정된 순간이 아니라 손이 턱에 닿은 순간을 시작으로 잡는다 — 그 앞을 버려 두면
          // 기록된 지속 시간이 실제보다 늘 짧아진다.
          episodeStart.current = candidateSince.current;
        }
        onConfirmedRef.current?.();
      }

      const nextActive = activeRef.current;
      // 확정 전이라도 손이 턱에 있으면 신호등에 바로 알린다. 아무 표시 없이 10초를 기다리면
      // 감지가 도는 중인지 멈춘 것인지 화면만 봐서는 알 수 없다.
      //
      // candidate 가 아니라 누적(windowStart)으로 판단한다. 유예 중에도 누적은 살아 있으므로,
      // 손이 잠깐 흔들릴 때마다 신호등이 초록으로 깜빡이면 안 된다.
      //
      // 경과 초는 candidateSince 가 아니라 windowStart 로 센다. 괴기 시작부터 세면 확정 뒤에도
      // 값이 계속 늘어나고, 화면이 상한에서 자르므로 "경고 10/10초" 에서 멈춰 버린다. 다음 경고까지
      // 남은 시간을 보여주는 칸이니 창이 다시 시작하면 0 으로 돌아가야 한다.
      const streakStart = windowStart.current;
      const nextHolding = streakStart !== null && !nextActive;
      // 초당 30번 불리는 자리라 정수 초가 바뀔 때만 렌더를 흘린다.
      const nextHoldingSeconds =
        streakStart !== null ? Math.floor((now - streakStart) / 1000) : 0;
      /**
       * 해제까지 남은 시간을 화면이 셀 수 있게 내보낸다. 괴는 중이면 null 이다.
       *
       * 확정된 뒤(nextActive)에만 의미가 있다. 확정 전에도 clearSince 가 찰 수 있는데
       * 그건 누적을 이어 갈지 말지를 재는 중이라, 코칭 화면이 닫히는 것과는 상관없다.
       */
      const nextReleasingSince = nextActive ? clearSince.current : null;
      if (
        nextActive !== state.active ||
        nextHolding !== holdingRef.current ||
        nextHoldingSeconds !== holdingSecondsRef.current ||
        blockedReason !== blockedReasonRef.current ||
        nextReleasingSince !== releasingSinceRef.current
      ) {
        holdingRef.current = nextHolding;
        holdingSecondsRef.current = nextHoldingSeconds;
        blockedReasonRef.current = blockedReason;
        releasingSinceRef.current = nextReleasingSince;
        setState((prev) => ({
          ...prev,
          active: nextActive,
          holding: nextHolding,
          holdingSeconds: nextHoldingSeconds,
          blockedReason,
          confirmedCount: prev.confirmedCount + (confirmed ? 1 : 0),
          releasingSince: nextReleasingSince,
        }));
      }
    },
    [state.active, flush],
  );

  return { ...state, onFrame, flushNow };
}
