// 졸음 감지 훅 (FR-AI-03).
//
// 판정 로직은 ai/src/drowsiness_detect_webcam.py 에서 웹캠으로 검증한 것을 그대로 옮겼다.
// 상수·랜드마크 인덱스를 바꿀 때는 그 스크립트도 같이 고쳐 두 곳이 갈리지 않게 할 것.
//
// EAR(Eye Aspect Ratio) — 눈의 세로/가로 비율. 눈을 감으면 세로가 줄어 값이 급락한다.
//
// 왜 고정 임계값이 아닌가
//   눈매가 사람마다 달라 "EAR < 0.2 면 감김" 같은 절대 기준은 오탐이 심하다.
//   시작 후 CALIB_SECONDS 동안 뜬 눈 EAR 의 중앙값을 재고, 그 비율로 임계값을 잡는다.
//
// 왜 지속 시간을 보는가
//   깜빡임은 0.1~0.3초다. DROWSY_SECONDS 이상 연속으로 감겨 있어야 졸음으로 본다.
//
// ⚠ 판정을 브라우저가 한다 (자세는 서버가 한다).
//   EAR 은 개인 기준선 없이는 의미가 없고, 초 단위 지속 판정을 서버 1Hz 표본으로는 할 수 없다.
//   대신 조작 가능성이 열리는데, 졸음은 점수를 깎는 방향이라 유리하게 조작할 동기가 없다.
//   판정만 브라우저가 하고 저장은 자세와 같이 실시간이다 — 구간이 닫히는 순간 한 건씩 보낸다.
import { useCallback, useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import type { NormalizedLandmark } from '@mediapipe/tasks-vision';

import { sendDrowsinessCheck } from '@/api/studyRecordApi';
import { getFaceLandmarker } from '@/lib/pose/faceLandmarker';
import type { DrowsinessEvent } from '@/types/studyRecord';
import { toLocalDateTimeString } from '@/utils/datetime';

/**
 * 추론 주기(ms). 자세(30fps)와 달리 낮게 잡는다 — 수 초의 지속을 보는 판정이라
 * 10fps 로도 표본이 충분하고, FaceLandmarker 는 Pose·YOLO 와 GPU·메인 스레드를 함께 쓴다.
 */
const INTERVAL_MS = 100;

/** 뜬 눈 기준선을 재는 시간(초) */
const CALIB_SECONDS = 3;
/**
 * 기준선의 이 비율 미만이면 "감김".
 *
 * 0.75 였을 때 눈을 뜨고 있어도 졸음으로 잡혔다. 기준선이 0.230 이면 임계값이 0.173 인데,
 * 책상이나 키보드를 내려다보면 눈꺼풀이 홍채를 덮어 EAR 이 그 아래로 쉽게 떨어진다.
 * 눈은 떠 있지만 수치상으로는 "감김"이 된다 — 공부 중에 가장 흔한 자세라 오탐이 잦았다.
 *
 * 0.68 이면 같은 기준선에서 임계값이 0.156 이 되어, 내려다보는 정도로는 안 걸리고 실제로
 * 눈꺼풀이 덮여야 걸린다. 더 낮추면 실눈을 뜨고 조는 것을 놓치기 시작한다.
 */
const EAR_CLOSE_RATIO = 0.68;
/** 임계값 하한. 캘리브레이션 중 눈을 감고 있었다면 기준선이 낮게 잡히는데, 그 경우 보호막이 된다 */
const EAR_MIN_FLOOR = 0.1;
/**
 * 이만큼 연속으로 감겨 있으면 졸음 확정.
 *
 * 프로토타입 값은 2초였는데 실제 공부 중에는 너무 자주 잡혔다. 깜빡임(~0.2초)만 걸러 낼 게
 * 아니라, 노트를 내려다보거나 눈을 지그시 감고 생각하는 몇 초도 졸음이 아니다.
 * 4초는 "잠깐 감았다"와 "졸고 있다"가 갈리는 지점이다.
 *
 * <b>자세 판정(관찰 구간)과 값을 맞추지 않는다.</b> 자세는 관찰 구간 중 80%가 나쁘면 확정이라
 * 중간에 자세가 잠깐 펴져도 누적이 이어지지만, 졸음은 <b>연속</b> 기준이라 눈을 한 번 뜨면
 * 처음부터 다시 센다. 자세와 같은 기준을 요구하면 그 시간 내리 감고 있어야 잡히는데, 그건 조는 게
 * 아니라 자는 것이다.
 */
const DROWSY_SECONDS = 4;
/** 눈을 다시 뜨고 이만큼 지나야 배너를 내린다 (한 프레임 튐으로 깜빡이지 않게) */
const RECOVER_SECONDS = 1;
/**
 * EAR 이동평균 표본 수 — 측정 떨림을 눌러준다.
 *
 * 10fps 라 5면 0.5초 평균이다. 4초 지속을 보는 판정이라 이 정도 지연은 영향이 없고,
 * 안경 반사나 고개를 살짝 움직일 때 한두 프레임 튀는 값이 임계값 아래로 내려가는 것을 막는다.
 */
const SMOOTH_FRAMES = 5;

/**
 * 눈 주변 6점. 순서가 EAR 수식과 맞물려 있어 바꾸면 안 된다.
 * [좌끝, 위1, 위2, 우끝, 아래2, 아래1]
 */
const LEFT_EYE = [33, 160, 158, 133, 153, 144];
const RIGHT_EYE = [362, 385, 387, 263, 373, 380];

export interface DrowsinessState {
  /** 모델 로딩 중 */
  loading: boolean;
  /** 기준선을 재는 중 — 이 동안은 판정하지 않는다 */
  calibrating: boolean;
  /** 지금 졸음 상태인가 (배너 표시용) */
  drowsy: boolean;
  /** 누적 확정 횟수 */
  detectCount: number;
  /**
   * 진행 중인 졸음 구간을 지금 끊어 서버로 보낸다. 진행 중인 구간이 없으면 아무것도 하지 않는다.
   *
   * 세션 종료 직전에 <b>await 해서</b> 호출할 것. 확정된 구간은 그때그때 저장되지만 나가는
   * 순간까지 졸고 있던 건은 아직 안 보냈기 때문에 그냥 두면 빠진다.
   */
  flushNow: () => Promise<void>;
  /**
   * 진행 중인 졸음 구간을 끊어 <b>보내지 않고</b> 돌려준다. 창 닫힘 대비 전송 전용이다.
   *
   * pagehide 에서는 axios 요청이 취소될 수 있어 호출 측이 fetch keepalive 로 직접 보낸다
   * (useSessionUnloadFlush). 구간을 먼저 비우므로 flushNow 와 같이 불려도 한쪽만 값을 얻는다.
   */
  takePending: () => DrowsinessEvent | null;
  /** 기준선을 다시 잰다 (조명·자리가 바뀌었을 때) */
  recalibrate: () => void;
}

/** EAR = (|p2-p6| + |p3-p5|) / (2 * |p1-p4|) */
function aspectRatio(pts: { x: number; y: number }[]): number {
  const dist = (a: { x: number; y: number }, b: { x: number; y: number }) =>
    Math.hypot(a.x - b.x, a.y - b.y);
  const v1 = dist(pts[1], pts[5]);
  const v2 = dist(pts[2], pts[4]);
  const h = dist(pts[0], pts[3]);
  return h > 0 ? (v1 + v2) / (2 * h) : 0;
}

/**
 * 정규화 좌표를 픽셀로 되돌려 눈 6점을 뽑는다.
 *
 * 정규화 좌표(0~1)를 그대로 쓰면 영상이 정사각형이 아닐 때 가로·세로 축척이 달라
 * EAR 이 왜곡된다. 파이썬 검증본과 같은 값을 얻으려면 픽셀로 환산해야 한다.
 */
function eyePoints(
  landmarks: NormalizedLandmark[],
  idx: number[],
  width: number,
  height: number,
) {
  return idx.map((i) => ({
    x: landmarks[i].x * width,
    y: landmarks[i].y * height,
  }));
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

/**
 * 감긴 시간(초) → 졸음 단계 1~5. 서버가 1~5 를 벗어난 값을 400 으로 막는다.
 *
 * 확정 기준(DROWSY_SECONDS)을 넘긴 시간만 단계에 반영한다. 절대 시간으로 나누면
 * 기준을 올리는 순간 갓 확정된 건까지 2단계로 올라가 전부 심각해 보인다.
 */
function toLevel(closedSeconds: number): number {
  const over = closedSeconds - DROWSY_SECONDS;
  return Math.min(5, Math.max(1, 1 + Math.floor(over / 4)));
}

export function useDrowsinessDetection(
  videoRef: RefObject<HTMLVideoElement | null>,
  enabled: boolean,
  /** 이벤트를 기록할 세션. null 이면 판정만 하고 서버에는 보내지 않는다 */
  sessionId: number | null = null,
): DrowsinessState {
  const [loading, setLoading] = useState(true);
  const [calibrating, setCalibrating] = useState(false);
  const [drowsy, setDrowsy] = useState(false);
  const [detectCount, setDetectCount] = useState(0);

  // 렌더 중에 ref 를 건드리면 안 되므로 갱신은 효과에서 한다(턱 괴기 훅과 같은 방식).
  // 자정을 넘겨 기록이 갈리면 이 값이 새 id 로 바뀐다 — 전송 시점의 최신 값을 읽어야 한다.
  const sessionIdRef = useRef(sessionId);
  useEffect(() => {
    sessionIdRef.current = sessionId;
  }, [sessionId]);

  /**
   * 개인 기준선. effect 재시작(스트레칭 열림·닫힘 등)마다 다시 재면 그때마다
   * CALIB_SECONDS 동안 판정이 멈추므로, 한 번 잡은 값을 넘어서 유지한다.
   */
  const baseline = useRef<number | null>(null);
  // setState 는 비동기라 판정 루프 안에서 최신 값을 읽기 위해 ref 를 병행한다
  const drowsyRef = useRef(false);
  /**
   * 확정된 졸음 구간. effect 바깥(flush)에서도 닫아야 하므로 ref 로 둔다.
   * startedAt 이 null 이면 진행 중인 구간이 없다.
   */
  const episode = useRef<{ startedAt: Date; closedSince: number } | null>(null);

  /**
   * 진행 중인 졸음 구간을 이벤트로 확정한다. 감긴 시간이 길수록 단계가 높다.
   *
   * 만들기만 하고 보내지 않는다 — 보내는 경로가 둘이라서다(감지 루프는 axios, 창 닫힘은
   * fetch keepalive). 구간을 <b>먼저</b> 비우므로 두 경로가 같이 불려도 한쪽만 값을 얻는다.
   * 이 순서가 뒤바뀌면 같은 구간이 두 번 저장된다.
   */
  const closeEpisode = useCallback((now: number): DrowsinessEvent | null => {
    const current = episode.current;
    if (current === null) return null;
    episode.current = null;

    const closedSeconds = (now - current.closedSince) / 1000;
    const level = toLevel(closedSeconds);
    if (import.meta.env.DEV) {
      console.info(
        `[졸음] 💤 구간 종료 — ${closedSeconds.toFixed(1)}초, 단계 ${level}`,
      );
    }
    return { level, detectedAt: toLocalDateTimeString(current.startedAt) };
  }, []);

  /** 구간을 닫고 바로 서버에 보낸다. 감지 루프와 세션 종료가 쓴다. */
  const closeAndSend = useCallback(
    (now: number): Promise<void> => {
      const event = closeEpisode(now);
      if (event === null) return Promise.resolve();
      const id = sessionIdRef.current;
      if (id === null) {
        // 세션 없이 방을 열어 본 경우(개발용 경로). 판정은 되지만 남길 곳이 없다.
        if (import.meta.env.DEV) {
          console.warn('[졸음] 세션 id 가 없어 저장을 건너뜁니다', event);
        }
        return Promise.resolve();
      }
      return sendDrowsinessCheck(id, event)
        .then(() => {
          if (import.meta.env.DEV) {
            console.info(
              `[졸음] ⬆️ 저장 완료 — 단계 ${event.level} @ ${event.detectedAt} (세션 ${id})`,
            );
          }
        })
        .catch((e) => {
          // 기록을 못 남겨도 공부는 이어져야 한다. 배너는 이미 떴다.
          console.warn('[졸음] 이벤트를 저장하지 못했습니다', e);
        });
    },
    [closeEpisode],
  );

  const flushNow = useCallback(() => closeAndSend(Date.now()), [closeAndSend]);

  const takePending = useCallback(
    () => closeEpisode(Date.now()),
    [closeEpisode],
  );

  const recalibrate = useCallback(() => {
    baseline.current = null;
  }, []);

  // 비활성화되면 배너를 내린다 (판정 루프와 분리해 effect 내 즉시 setState 를 피함)
  useEffect(() => {
    if (enabled) return;
    drowsyRef.current = false;
    const id = setTimeout(() => {
      setDrowsy(false);
      setCalibrating(false);
    }, 0);
    return () => clearTimeout(id);
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;
    let timer: number | undefined;

    // 판정 상태 (effect 안에 두어 재시작 시 초기화된다)
    const smoothing: number[] = [];
    const calibSamples: number[] = [];
    let calibStartedAt = 0;
    /** 연속으로 감기기 시작한 시각. null 이면 지금 눈을 뜨고 있다 */
    let closedSince: number | null = null;
    /** 졸음 확정 뒤 눈을 다시 뜬 시각. 회복 판정용 */
    let openSince: number | null = null;
    let lastTimestamp = -1;

    (async () => {
      let landmarker: Awaited<ReturnType<typeof getFaceLandmarker>>;
      try {
        landmarker = await getFaceLandmarker();
        console.info('[졸음] 감지 모델 준비 완료 (FaceLandmarker)');
      } catch (e) {
        // 모델 파일이 없으면 개발 서버가 SPA 폴백으로 index.html 을 200 으로 돌려주고,
        // MediaPipe 가 그 HTML 을 zip 번들로 열려다 "Unable to open zip archive" 로 죽는다.
        // 파일 없음이 404 로 드러나지 않으므로 원인을 짐작하기 어렵다 — 그래서 여기서 알려준다.
        console.error(
          '[졸음] FaceLandmarker 로드 실패 — public/mediapipe/models/face_landmarker.task 가 있는지 확인하세요. ' +
            '없으면 npm run setup:mediapipe 를 실행하면 됩니다.',
          e,
        );
        if (!cancelled) setLoading(false);
        return;
      }
      if (cancelled) return;
      setLoading(false);
      if (baseline.current === null) setCalibrating(true);

      function tick() {
        if (cancelled) return;
        const video = videoRef.current;

        if (!video || video.readyState < 2 || video.videoWidth === 0) {
          timer = window.setTimeout(tick, INTERVAL_MS);
          return;
        }

        // 같은 타임스탬프로 두 번 호출하면 MediaPipe 가 에러를 낸다
        const timestamp = performance.now();
        if (timestamp <= lastTimestamp) {
          timer = window.setTimeout(tick, INTERVAL_MS);
          return;
        }
        lastTimestamp = timestamp;

        try {
          const result = landmarker.detectForVideo(video, timestamp);
          const face = result.faceLandmarks?.[0];
          const now = Date.now();

          if (!face) {
            // 얼굴이 안 잡히면 판정을 보류한다. 자리비움을 졸음으로 세면 안 되고,
            // 눈이 안 보이는 것과 감은 것은 다른 상태다.
            smoothing.length = 0;
            closedSince = null;
            timer = window.setTimeout(tick, INTERVAL_MS);
            return;
          }

          const w = video.videoWidth;
          const h = video.videoHeight;
          const raw =
            (aspectRatio(eyePoints(face, LEFT_EYE, w, h)) +
              aspectRatio(eyePoints(face, RIGHT_EYE, w, h))) /
            2;

          smoothing.push(raw);
          if (smoothing.length > SMOOTH_FRAMES) smoothing.shift();
          const ear = smoothing.reduce((s, v) => s + v, 0) / smoothing.length;

          // 1) 기준선이 없으면 먼저 재고, 그동안은 판정하지 않는다
          if (baseline.current === null) {
            if (calibStartedAt === 0) calibStartedAt = now;
            calibSamples.push(ear);
            if (now - calibStartedAt >= CALIB_SECONDS * 1000) {
              // 평균이 아니라 중앙값 — 캘리브레이션 중 한두 번 깜빡여도 흔들리지 않는다
              baseline.current = median(calibSamples);
              calibSamples.length = 0;
              setCalibrating(false);
              console.info(
                `[졸음] 기준선 ${baseline.current.toFixed(3)} · 임계값 ${Math.max(baseline.current * EAR_CLOSE_RATIO, EAR_MIN_FLOOR).toFixed(3)}`,
              );
            }
            timer = window.setTimeout(tick, INTERVAL_MS);
            return;
          }

          const threshold = Math.max(
            baseline.current * EAR_CLOSE_RATIO,
            EAR_MIN_FLOOR,
          );

          // 2) 감김 지속 시간으로 판정한다
          if (ear < threshold) {
            openSince = null;
            closedSince ??= now;
            if (
              !drowsyRef.current &&
              now - closedSince >= DROWSY_SECONDS * 1000
            ) {
              drowsyRef.current = true;
              episode.current = {
                startedAt: new Date(closedSince),
                closedSince,
              };
              setDrowsy(true);
              setDetectCount((c) => c + 1);
              // 기준을 바꿔도 문구가 따라오도록 상수를 그대로 쓴다.
              // EAR 을 같이 남긴다 — 눈을 뜨고 있는데 잡혔을 때, 임계값을 얼마나 밑돌았는지
              // 알아야 기준을 더 낮출지 다른 방법을 쓸지 정할 수 있다.
              console.warn(
                `[졸음] 😴 졸음 확정 — 눈이 ${DROWSY_SECONDS}초 이상 감겨 있습니다` +
                  ` (EAR ${ear.toFixed(3)} < 임계값 ${threshold.toFixed(3)}, 기준선 ${baseline.current.toFixed(3)})`,
              );
            }
          } else {
            closedSince = null;
            if (drowsyRef.current) {
              openSince ??= now;
              if (now - openSince >= RECOVER_SECONDS * 1000) {
                drowsyRef.current = false;
                void closeAndSend(now);
                setDrowsy(false);
              }
            }
          }
        } catch (e) {
          if (import.meta.env.DEV) console.warn('[졸음] 추론 실패', e);
        }

        timer = window.setTimeout(tick, INTERVAL_MS);
      }

      tick();
    })();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      // 졸고 있는 중에 카메라를 끄거나 스트레칭이 열리면 구간이 열린 채로 남는다.
      // 여기서 확정하지 않으면 그 졸음은 기록되지 않는다.
      // (정상 종료 경로는 flushNow() 가 먼저 닫으므로 여기서 중복 전송되지 않는다)
      void closeAndSend(Date.now());
    };
  }, [enabled, videoRef, closeAndSend]);

  return {
    loading,
    calibrating,
    drowsy,
    detectCount,
    flushNow,
    takePending,
    recalibrate,
  };
}
