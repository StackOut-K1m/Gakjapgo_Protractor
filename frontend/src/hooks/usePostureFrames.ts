// src/hooks/usePostureFrames.ts
import { useCallback, useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import axios from 'axios';
import type { NormalizedLandmark } from '@mediapipe/tasks-vision';

import { sendPostureFrame } from '@/api/postureApi';
import { usePoseStream, type PoseFrameHandler } from '@/hooks/usePoseStream';
import { extractPostureFeatures } from '@/lib/pose/postureFeatures';
import {
  ALERT_SEVERITY,
  POSTURE_TYPES,
  RELEASE_SEVERITY,
} from '@/types/posture';
import type {
  PostureFeatures,
  PostureFrameResponse,
  PostureType,
} from '@/types/posture';

/** 전송 주기. 서버가 지속 시간을 보고 판정하므로 1초면 충분하다 */
const SEND_INTERVAL_MS = 1000;

/** 같은 오류가 초당 한 번씩 쌓이면 원인을 찾을 수 없다. 연속 이만큼 실패하면 멈춘다 */
const MAX_CONSECUTIVE_ERRORS = 3;

/**
 * 확정까지 필요한 지속 시간(초). 서버 app.posture.window-seconds 와 같은 값이어야 한다.
 * 판정 자체는 서버가 하고, 이 값은 "몇 초째 나쁜 자세인지"를 화면에 보여주는 데만 쓴다.
 *
 * 서버 쪽 값을 바꾸면 여기도 같이 바꾼다. 어긋나면 카운터가 다 찼는데 경고가 안 뜨거나
 * 그 반대가 되어, 사용자에게는 감지가 고장 난 것으로 보인다.
 */
export const POSTURE_WINDOW_SECONDS = 10;

/**
 * 경고가 풀리기까지 바른 자세를 이어가야 하는 시간(초).
 * 서버 app.posture.recovery-seconds 와 같은 값이어야 한다 — 이 값으로 화면의 남은 시간을
 * 셀 뿐이고, 실제 해소 판정은 서버가 한다.
 */
export const POSTURE_RECOVERY_SECONDS = 2;

/**
 * 이보다 오래된 피처는 보내지 않는다(ms).
 *
 * 랜드마크 루프(30fps)와 전송 타이머(1Hz)가 분리돼 있어서, 영상이 멈추면(요소 교체 뒤
 * 재생 실패·창 가림) 루프만 죽고 타이머는 마지막 피처를 계속 재전송했다 — 서버는 그
 * 박제된 바른 자세를 매초 다시 판정하므로 신호등이 초록으로 얼어붙고, 실제 자세는 아무도
 * 보지 않는 상태가 된다. 묵은 피처는 사람이 안 잡힌 것과 같게 취급해 측정을 멈춘다.
 */
const STALE_FEATURES_MS = 2_000;

/**
 * 경고가 풀리기까지 지금 어디쯤인지.
 *
 * - `bad`     아직 경고 기준(심각도 4 이상). 자세를 고쳐야 한다
 * - `almost`  경고는 아니지만 해제 기준(2 이하)에도 못 미친다. <b>여기 머무르면 영영 안 풀린다</b>
 * - `paused`  판정 보류(가려짐·몸통 회전 등). 서버가 세지 못하므로 시간도 안 간다
 * - `holding` 해제 기준을 통과해 세는 중. endsAt 에 풀릴 시각이 들어 있다
 */
export type PostureRecovery =
  { phase: 'bad' | 'almost' | 'paused' } | { phase: 'holding'; endsAt: number };

export interface PostureFramesState {
  /**
   * 지금 화면에 경고로 보여야 하는 자세. 서버가 확정했고 아직 해소하지 않은 것이다.
   *
   * 해소 시점은 서버가 정한다(app.posture.recovery-seconds — 바른 자세 2초 연속).
   * 화면에서만 먼저 내리지 않는다. 서버가 아직 경고 중인 채로 화면만 내리면, 자세가 한 번만
   * 흐트러져도 곧바로 다시 켜져서 경고가 껐다 켜지는 것처럼 보이기 때문이다.
   */
  active: PostureType[];
  /** 확정 누적 횟수. 경고 카운트와 스트레칭 트리거가 이 값을 쓴다 */
  confirmedCount: number;
  /**
   * 자세별 현재 나쁜 자세 지속 시간(초). 없으면 지금은 정상이라는 뜻이다.
   *
   * 확정 여부는 서버가 정한다. 서버는 "관찰 구간 중 80% 이상"으로 보는 반면 이 값은 마지막으로
   * 정상이었던 시점부터 그냥 흐른 시간이라, 진행 상황을 눈으로 확인하는 용도의 근사치다.
   */
  badSeconds: Partial<Record<PostureType, number>>;
  /**
   * 이 세션에서 나쁜 자세로 읽힌 초의 합. 확정 여부와 무관하다.
   *
   * 종료 응답을 못 받았을 때(네트워크 실패·409) 결과 화면이 쓸 대비값이다. 서버도 같은 규칙으로
   * 세므로(PostureWindowTracker.badPostureSeconds) 두 값이 비슷하게 나온다 — 전송이 1초에
   * 한 번이라 응답 1개 = 1초로 센다.
   *
   * 여러 자세가 동시에 나쁜 초도 1초로만 센다. 종류별로 더하면 나쁜 자세 시간이 학습 시간을 넘는다.
   *
   * 위 badSeconds 와 다르다. 그쪽은 지금 이어지는 구간의 길이라 정상으로 돌아가면 0 이 되고,
   * 이 값은 세션 누적이라 줄지 않는다(스트레칭으로 전송이 멈춰도 유지된다).
   */
  badPostureSeconds: number;
  /** 마지막 판정 응답. 개발 중 확인용 */
  lastResponse: PostureFrameResponse | null;
  /** 전송이 멈춘 이유. null 이면 정상 동작 중 */
  error: string | null;
  /**
   * 사람이 연속으로 안 잡힌 시간(초). 잡히고 있으면 0 이다.
   *
   * 자리비움 판정의 근거다. 랜드마크가 안 나오는 프레임은 서버로 보내지 않으므로
   * 서버 응답만으로는 "자리를 비웠다"와 "판정할 게 없다"를 구분할 수 없다.
   * 이 훅이 랜드마커 루프를 갖고 있어서 여기서만 알 수 있는 값이다.
   *
   * 전송이 멈춘 동안(running=false)에는 갱신되지 않고 0 으로 남는다.
   * 정보가 없는 것을 자리비움으로 세면 안 되기 때문이다.
   */
  personMissingSeconds: number;
  /**
   * 경고가 풀리기까지 지금 어디쯤인지. 경고가 없으면 null.
   *
   * <p>
   * <b>'almost' 가 이 값을 만든 이유다.</b> 서버는 심각도 4 이상에서 경고를 켜고 2 이하에서
   * 푸는데, 그 사이(3)는 어느 쪽도 아니다. 자세를 어중간하게 고쳐 3에 머무르면 아무리 오래
   * 유지해도 해제되지 않는다. 그런데 화면은 "2초만 유지하면 됩니다"라고 말하고 있어서,
   * 시킨 대로 했는데 안 바뀌는 상황이 된다 — 무엇이 잘못됐는지 알 방법이 없다.
   */
  recovery: PostureRecovery | null;
  /**
   * 지금 경고 중인 자세가 모두 풀릴 것으로 보이는 시각(ms). 회복 중이 아니면 null.
   *
   * <p>
   * 해소 판정은 서버가 한다 — 바른 자세 <b>응답</b>이 recovery-seconds(2회) 이어지면
   * RESOLVED 를 내려준다. 그 사실은 해소된 뒤에야 알 수 있어서, 자세를 고친 사람은 화면이
   * 언제 돌아올지 모르는 채로 기다리게 된다. 그래서 같은 규칙을 화면에서도 세어 예고한다.
   *
   * <p>
   * <b>시작 시각이 아니라 끝날 시각으로 주고, 응답마다 다시 잡는다.</b> 서버가 세는 단위는
   * "흐른 시간"이 아니라 "받은 응답 수"다. 전송이 늦어지거나(응답 지연·사람 미검출로 건너뜀)
   * 판정이 보류되면 실제 해소는 그만큼 밀리는데, 시작 시각에 2초를 더해 두면 화면만 먼저
   * 0 에 닿아 "곧 돌아갑니다"를 한참 붙들고 있게 된다. 매 응답마다 남은 횟수로 다시 계산하면
   * 늦어진 만큼 자연히 뒤로 밀린다.
   */
  recoveryEndsAt: number | null;
}

interface UsePostureFramesOptions {
  videoRef: RefObject<HTMLVideoElement | null>;
  /** 스터디룸 입장 시 발급된 studyRecordId. 없으면 전송하지 않는다 */
  sessionId: number | null;
  /** 카메라가 켜져 있고 판정을 돌려도 되는 상태인가 */
  enabled: boolean;
  /**
   * 쓸 판정 방식(개발용 비교 도구). null 이면 서버 기본값으로 판정한다.
   *
   * 바꿔도 전송 타이머를 다시 걸지 않는다. 매번 ref 에서 읽기 때문이다.
   * 의존성에 넣으면 방식을 바꿀 때마다 1초 주기가 처음부터 다시 시작해서,
   * 자세를 그대로 두고 방식만 비교하려는 목적과 어긋난다.
   */
  detector?: string | null;
  /**
   * 같은 추론 결과를 쓰고 싶은 다른 판정기에 프레임을 넘겨준다.
   *
   * 랜드마커가 싱글턴이라 화면에서 루프를 두 개 돌릴 수 없다(usePoseStream 주석 참고).
   * 턱 괴기처럼 서버로 보내지 않고 브라우저에서 판정하는 것들이 이 자리를 쓴다.
   * 초당 30회 불리므로 안에서 setState 를 그대로 부르면 안 된다.
   */
  onLandmarks?: PoseFrameHandler;
}

const INITIAL: PostureFramesState = {
  active: [],
  confirmedCount: 0,
  badSeconds: {},
  badPostureSeconds: 0,
  lastResponse: null,
  error: null,
  personMissingSeconds: 0,
  recovery: null,
  recoveryEndsAt: null,
};

/**
 * 자세별 나쁜 자세 시작 시각을 갱신하고, 지금까지의 지속 시간을 만든다.
 *
 * 판정 보류(severity=null)는 시작도 끝도 아니다. 가려졌다고 타이머를 되돌리면 실제로는
 * 계속 나쁜 자세인데 관찰 구간을 영영 못 채우므로, 서버 윈도우와 같이 그냥 건너뛴다.
 */
function advanceBadStreaks(
  startedAt: Partial<Record<PostureType, number>>,
  res: PostureFrameResponse,
  now: number,
): Partial<Record<PostureType, number>> {
  res.judgements.forEach(({ type, severity }) => {
    if (severity === null) return;
    if (severity >= ALERT_SEVERITY) {
      startedAt[type] ??= now;
    } else {
      delete startedAt[type];
    }
  });
  // 확정된 자세는 카운트가 이미 올랐다. 아직 나쁜 자세면 다음 구간을 0초부터 다시 잰다.
  // 지우기만 하면 여전히 빨간불인데 지속 시간만 사라져 한 틱 동안 표시가 튄다.
  res.confirmed.forEach((type) => {
    if (startedAt[type] !== undefined) startedAt[type] = now;
  });

  const badSeconds: Partial<Record<PostureType, number>> = {};
  (Object.keys(startedAt) as PostureType[]).forEach((type) => {
    badSeconds[type] = Math.floor((now - startedAt[type]!) / 1000);
  });
  return badSeconds;
}

/** 두 목록이 같은 자세를 담고 있는지. 순서는 alerting 집합이 정하므로 그대로 비교한다 */
function sameTypes(a: PostureType[], b: PostureType[]): boolean {
  return a.length === b.length && a.every((type, i) => type === b[i]);
}

function describeError(e: unknown): string {
  if (axios.isAxiosError(e)) {
    const status = e.response?.status;
    if (status === 404) {
      // 기준선이 없거나 세션이 없다. 둘 다 재시도로 풀리지 않으므로 바로 멈춘다.
      // 어느 쪽인지는 서버 메시지에만 있다. 뭉쳐서 "캘리브레이션을 다시 해주세요" 로만 보여주면
      // 세션이 없는 경우(입장 실패)에 사용자가 캘리브레이션만 반복하게 된다.
      const serverMessage = (
        e.response?.data as { message?: string } | undefined
      )?.message;
      return serverMessage
        ? `자세 판정을 시작할 수 없습니다: ${serverMessage}`
        : '자세 기준선 또는 세션을 찾을 수 없습니다. 캘리브레이션을 다시 해주세요.';
    }
    if (status === 401) return '인증이 만료되었습니다. 다시 로그인해주세요.';
    const detail =
      (e.response?.data as { message?: string } | undefined)?.message ??
      e.message;
    return `자세 판정 요청 실패 (${status ?? '네트워크'}): ${detail}`;
  }
  return '자세 판정 요청 실패';
}

/**
 * 스터디룸에서 1초에 한 번 피처 벡터를 서버로 보내고 판정 결과를 받는다.
 *
 * 판정은 브라우저가 아니라 서버가 한다. 점수와 랭킹의 원천이라 클라이언트가 보낸 결과를
 * 믿으면 조작이 가능하고, 판정 방식을 비교할 때 기기 성능 차이가 변수로 섞이면 안 되기 때문이다.
 *
 * 랜드마크 추출은 매 프레임(30fps) 돌지만 전송은 1Hz 다. 서버가 지속 시간을 보고
 * 판정하므로 그보다 자주 보낼 이유가 없다.
 */
export function usePostureFrames({
  videoRef,
  sessionId,
  enabled,
  detector = null,
  onLandmarks,
}: UsePostureFramesOptions): PostureFramesState {
  const [state, setState] = useState<PostureFramesState>(INITIAL);
  const latestFeatures = useRef<PostureFeatures | null>(null);
  /** latestFeatures 를 뽑은 시각. 루프가 멈춘 채 묵은 값을 재전송하는 것을 막는다 */
  const latestFeaturesAt = useRef(0);
  /** 사람이 안 잡히기 시작한 시각. null 이면 지금 잡히고 있다 */
  const missingSince = useRef<number | null>(null);
  /**
   * 서버가 확정했고 아직 해소하지 않은 자세.
   *
   * 응답은 "이번에 바뀐 것"만 주므로 지금 켜져 있는 집합은 여기 쌓아 둬야 한다.
   * 스트레칭 등으로 전송이 5초 넘게 멈추면 서버가 판정 이력을 비우는데, 그때 경고 중이던
   * 자세는 재개 후 첫 응답의 resolved 로 알려 준다 — 그 신호가 없던 시절에는 여기 남은
   * 경고가 영영 안 지워져 경고 화면에 갇혔다(PostureWindowTracker.Gap 주석 참고).
   */
  const alerting = useRef<Set<PostureType>>(new Set());

  // 판정 방식을 바꿔도 전송 타이머를 다시 걸지 않으려고 ref 로 읽는다.
  // 다시 걸면 1초 주기가 초기화돼서, 같은 자세를 두고 방식만 비교하려는 목적과 어긋난다.
  const detectorRef = useRef(detector);
  useEffect(() => {
    detectorRef.current = detector;
  }, [detector]);

  // 판정을 돌릴 수 없는 상태면 랜드마커도 돌리지 않는다 (GPU 낭비 방지)
  const running = enabled && sessionId !== null && state.error === null;

  // 콜백이 매 렌더 새로 만들어져도 아래 handleFrame 을 다시 만들지 않는다.
  // 렌더 중에 ref 를 건드리면 안 되므로 갱신은 효과에서 한다(usePoseStream 과 같은 방식).
  const onLandmarksRef = useRef(onLandmarks);
  useEffect(() => {
    onLandmarksRef.current = onLandmarks;
  }, [onLandmarks]);

  const handleFrame = useCallback(
    (lms: NormalizedLandmark[] | null, width: number, height: number) => {
      onLandmarksRef.current?.(lms, width, height);
      if (lms) {
        latestFeatures.current = extractPostureFeatures(lms, width, height);
        latestFeaturesAt.current = Date.now();
        missingSince.current = null;
      } else {
        latestFeatures.current = null;
        // 초당 30회 불리는 자리다. 여기서 setState 하면 화면이 그만큼 다시 그려진다.
        // 시각만 기록하고, 초 단위 환산은 아래 1Hz 타이머에서 한다.
        missingSince.current ??= Date.now();
      }
    },
    [],
  );

  usePoseStream(videoRef, running, handleFrame);

  useEffect(() => {
    if (!running || sessionId === null) return;

    let cancelled = false;
    let consecutiveErrors = 0;
    // 응답이 1초보다 오래 걸릴 때 요청이 겹치지 않도록 한 번에 한 건만 보낸다
    let inFlight = false;
    // 자세별 나쁜 자세 시작 시각. 전송이 멈추면 같이 버린다
    const badStreakStartedAt: Partial<Record<PostureType, number>> = {};
    // 자세별 연속 정상 응답 수(1응답 = 1초). 전송이 멈춘 사이는 자세를 고쳤다는 근거가
    // 아니므로 재개할 때 0 부터 다시 센다 — 서버 쪽 streak 도 같이 끊긴다.
    const goodStreak: Partial<Record<PostureType, number>> = {};
    // 경고 중인 자세가 모두 정상으로 읽히기 시작한 시각. 회복 중이 아니면 null
    let recovery: PostureRecovery | null = null;
    let recoveryEndsAt: number | null = null;

    const timer = setInterval(async () => {
      const features = latestFeatures.current;
      // 영상이 멈춰 새 프레임이 안 나오는 상태. 마지막 피처를 재전송하면 그 자세가
      // 영원히 이어지는 것으로 판정되므로(위 STALE_FEATURES_MS 주석) 보내지 않는다.
      const stale =
        features !== null &&
        Date.now() - latestFeaturesAt.current >= STALE_FEATURES_MS;

      // 자리비움 판정용 — 전송 여부와 무관하게 매초 갱신한다.
      // 값이 실제로 바뀔 때만 setState 해서 매초 리렌더가 늘지 않게 한다.
      // 영상이 멈춘 것도 사람이 안 잡히는 것과 같게 센다 — 마지막 프레임 시각부터다.
      const missing =
        missingSince.current ?? (stale ? latestFeaturesAt.current : null);
      const missingSeconds =
        missing === null ? 0 : Math.floor((Date.now() - missing) / 1000);
      setState((prev) =>
        prev.personMissingSeconds === missingSeconds
          ? prev
          : { ...prev, personMissingSeconds: missingSeconds },
      );

      if (stale && import.meta.env.DEV && missingSeconds % 10 === 2) {
        console.warn(
          `[자세] 영상이 멈춰 전송을 중단했습니다 (마지막 프레임 ${missingSeconds}초 전)`,
        );
      }

      // 사람이 안 잡힌 프레임은 보내지 않는다. 서버 윈도우가 그만큼 진행되지 않을 뿐이고,
      // 빈 값을 보내면 판정 보류가 통계를 왜곡한다.
      if (!features || stale || inFlight) return;

      inFlight = true;
      try {
        const res = await sendPostureFrame(
          sessionId,
          features,
          detectorRef.current,
        );
        if (cancelled) return;
        consecutiveErrors = 0;

        // 판정이 실제로 돌아가는지 눈으로 확인할 수 있게 매 응답을 남긴다.
        // 예: [자세] ⚪ 거북목 0 · 🟠 기울기 2 (18.3°)  ← 나쁜 자세 감지 중
        if (import.meta.env.DEV) {
          const KO: Record<string, string> = {
            FORWARD_HEAD: '거북목',
            SHOULDER_TILT: '기울기',
          };
          const SKIP_KO: Record<string, string> = {
            TORSO_ROTATED: '몸틀림',
            LOW_VISIBILITY: '가려짐',
            NO_BASELINE: '기준선없음',
          };
          // 심각도 0~5 를 색으로: ⚪ 정상 / 🟡 경미 / 🟠 주의 / 🔴 심각(확정 후보)
          const DOT = ['⚪', '🟡', '🟠', '🟠', '🔴', '🔴'];

          const parts = res.judgements
            .map((j) => {
              const name = KO[j.type] ?? j.type;
              if (j.skipReason) {
                return `⏸ ${name} 보류(${SKIP_KO[j.skipReason] ?? j.skipReason})`;
              }
              const sev = j.severity ?? 0;
              const deg =
                j.deviationDegrees !== null && Number(j.deviationDegrees) > 0
                  ? ` (${j.deviationDegrees}°)`
                  : '';
              return `${DOT[sev] ?? '⚪'} ${name} ${sev}${deg}`;
            })
            .join(' · ');
          const tail = res.goodPosture
            ? ' ← 좋은 자세 ✅'
            : ' ← 나쁜 자세 감지 중';
          console.info(`[자세] ${parts}${tail}`);

          if (res.confirmed.length > 0) {
            const names = res.confirmed.map((t) => KO[t] ?? t).join(', ');
            console.warn(
              `[자세] 🚨🚨🚨 ${names} 확정! — 나쁜 자세가 기준 시간을 채웠습니다 (경고 발동 · DB 저장됨)`,
            );
          }
          if (res.resolved.length > 0) {
            const names = res.resolved.map((t) => KO[t] ?? t).join(', ');
            console.info(
              `[자세] 💚 ${names} 해소 — 자세가 돌아왔습니다 (이벤트 종료 기록)`,
            );
          }
        }

        const badSeconds = advanceBadStreaks(
          badStreakStartedAt,
          res,
          Date.now(),
        );

        // 이번 응답에 나쁘게 읽힌 자세가 하나라도 있었는지. 서버의 badPostureSeconds 와 같은
        // 규칙이다 — 종류 수와 무관하게 1초만 센다. 보류(severity=null)는 나쁨이 아니다.
        const risky = res.judgements.some(
          ({ severity }) => severity !== null && severity >= ALERT_SEVERITY,
        );

        res.confirmed.forEach((t) => alerting.current.add(t));
        res.resolved.forEach((t) => alerting.current.delete(t));

        // 서버와 같은 규칙으로 회복을 따라 센다(PostureWindowTracker.accept 참고).
        // 판정 보류(severity=null)는 정상도 나쁨도 아니라 streak 를 건드리지 않는다 —
        // 가려진 동안을 회복으로 세면 자세를 고치지 않아도 남은 시간이 흘러간다.
        res.judgements.forEach(({ type, severity }) => {
          if (severity === null) return;
          goodStreak[type] =
            severity <= RELEASE_SEVERITY ? (goodStreak[type] ?? 0) + 1 : 0;
        });

        // 회복이 지금 어디쯤인지 이번 응답의 심각도로 정한다.
        //
        // 아는 종류만 본다. 서버가 더 이상 판정하지 않는 자세(라운드숄더)가 예전에 확정된
        // 채로 alerting 에 남아 있을 수 있는데, 그건 응답에 안 실려 영영 회복되지 않는 것으로
        // 보인다.
        const severityOf = new Map(
          res.judgements.map((j) => [j.type, j.severity]),
        );
        const watching = [...alerting.current].filter((type) =>
          POSTURE_TYPES.includes(type),
        );

        if (watching.length === 0) {
          recovery = null;
        } else if (watching.some((type) => severityOf.get(type) == null)) {
          // 하나라도 판정을 못 하면 서버 streak 도 안 오른다. 남은 시간을 셀 근거가 없다.
          recovery = { phase: 'paused' };
        } else {
          // 가장 나쁜 자세가 전체를 결정한다 — 하나라도 기준에 못 미치면 해제되지 않는다.
          const worst = Math.max(
            ...watching.map((type) => severityOf.get(type) as number),
          );
          if (worst >= ALERT_SEVERITY) {
            recovery = { phase: 'bad' };
          } else if (worst > RELEASE_SEVERITY) {
            recovery = { phase: 'almost' };
          } else {
            const minStreak = Math.min(
              ...watching.map((type) => goodStreak[type] ?? 0),
            );
            recovery = {
              phase: 'holding',
              endsAt:
                Date.now() +
                Math.max(0, POSTURE_RECOVERY_SECONDS - minStreak) * 1000,
            };
          }
        }
        recoveryEndsAt = recovery?.phase === 'holding' ? recovery.endsAt : null;

        setState((prev) => {
          const visible = [...alerting.current];
          // 내용이 같으면 이전 배열을 그대로 쓴다. 매초 새 배열을 만들면 이 값을 의존성으로
          // 삼는 useMemo/useEffect 가 아무 변화 없이도 초마다 다시 돈다.
          const active = sameTypes(prev.active, visible)
            ? prev.active
            : visible;
          return {
            // personMissingSeconds 는 위 1Hz 타이머가 관리한다. 여기서 새로 쓰면
            // 응답이 도착할 때마다 자리비움 시간이 되돌아간다.
            ...prev,
            active,
            confirmedCount: prev.confirmedCount + res.confirmed.length,
            badSeconds,
            badPostureSeconds: prev.badPostureSeconds + (risky ? 1 : 0),
            lastResponse: res,
            error: null,
            recovery,
            recoveryEndsAt,
          };
        });
      } catch (e) {
        if (cancelled) return;
        const message = describeError(e);
        console.error('[posture-frames]', message, e);

        const fatal = axios.isAxiosError(e) && e.response?.status === 404;
        consecutiveErrors += 1;
        if (fatal || consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
          setState((prev) => ({ ...prev, error: message }));
        }
      } finally {
        inFlight = false;
      }
    }, SEND_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearInterval(timer);
      // 멈춘 동안 남아 있던 피처를 다음 재개 때 보내지 않는다
      latestFeatures.current = null;
      // 멈춘 사이의 시간을 자리비움으로 세면 안 된다. 재개 때 0 부터 다시 잰다.
      missingSince.current = null;
      // 지속 시간 표시도 같이 지운다. 멈춘 사이에도 시간이 흐른 것처럼 보이면 안 된다
      setState((prev) =>
        Object.keys(prev.badSeconds).length > 0 || prev.personMissingSeconds > 0
          ? { ...prev, badSeconds: {}, personMissingSeconds: 0 }
          : prev,
      );
    };
  }, [running, sessionId]);

  return state;
}
