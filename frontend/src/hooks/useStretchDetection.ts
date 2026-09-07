// 스트레칭 동작 실시간 판정 훅.
//
// 스트레칭 화면이 열려 있는 동안 웹캠 프레임을 MediaPipe 로 분석해
// 동작을 몇 번 수행했는지 세고, 진행률을 0~100 으로 돌려준다.
//
// 흐름
//   1) 준비(BASELINE_MS): 시작 자세를 표본으로 모아 기준선을 만든다
//   2) 판정: 동작별 판정기(stretchDetectors)에 프레임을 먹여 횟수를 센다
//
// 기준선을 매번 새로 잡는 이유: 스트레칭 판정은 "시작 자세 대비 얼마나 움직였나"라
// 그 자리의 카메라 각도·앉은 자세를 기준으로 삼는 게 정확하다.
// 다만 어깨 높이처럼 개인 기준선(캘리브레이션)이 더 정확한 항목은 그 값으로 덮어쓴다.
import { useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';

import { MovingAverage, computeMetrics } from '@/lib/pose/landmarks';
import type { PoseMetrics } from '@/lib/pose/landmarks';
import { getPoseLandmarker } from '@/lib/pose/poseLandmarker';
import {
  buildStretchBaseline,
  createStretchDetector,
} from '@/lib/pose/stretchDetectors';
import type {
  StretchBaseline,
  StretchDetector,
} from '@/lib/pose/stretchDetectors';
import type { PostureBaseline } from '@/types/posture';

/** 시작 자세를 모으는 시간(ms). 파이썬 CALIB_SECONDS 보다 짧게 잡아 대기감을 줄였다 */
const BASELINE_MS = 2000;

/** 기준선을 믿으려면 최소 이만큼의 표본이 필요하다 */
const MIN_BASELINE_SAMPLES = 15;

/**
 * 판정에 쓰는 지표의 이동평균 창 (파이썬 SMOOTH_FRAMES=4~5 대응).
 * 랜드마크는 매 프레임 떨리기 때문에 원시값으로 판정하면 임계값 경계에서
 * 조건이 깜빡여 유지 카운트가 계속 끊긴다. 파이썬 스크립트와 동일하게 평활화한다.
 */
const SMOOTH_FRAMES = 4;

/** 판정기가 참조하는 지표만 평활화한 사본을 만들어 주는 함수를 돌려준다 */
function createSmoother() {
  const avg = {
    headRoll: new MovingAverage(SMOOTH_FRAMES),
    headPitch: new MovingAverage(SMOOTH_FRAMES),
    gapLeft: new MovingAverage(SMOOTH_FRAMES),
    gapRight: new MovingAverage(SMOOTH_FRAMES),
    earWidth: new MovingAverage(SMOOTH_FRAMES),
    noseX: new MovingAverage(SMOOTH_FRAMES),
    noseY: new MovingAverage(SMOOTH_FRAMES),
  };
  return (m: PoseMetrics): PoseMetrics => ({
    ...m,
    headRoll: avg.headRoll.push(m.headRoll),
    headPitch: avg.headPitch.push(m.headPitch),
    earShoulderGapLeft: avg.gapLeft.push(m.earShoulderGapLeft),
    earShoulderGapRight: avg.gapRight.push(m.earShoulderGapRight),
    earWidth: avg.earWidth.push(m.earWidth),
    noseRel: { x: avg.noseX.push(m.noseRel.x), y: avg.noseY.push(m.noseRel.y) },
  });
}

export interface StretchDetectionState {
  /** 판정기가 붙어 있는 동작인가. false 면 호출부가 수동 완료를 제공해야 한다 */
  supported: boolean;
  /** 준비(기준선 수집) 중 */
  preparing: boolean;
  /** 0~100 */
  progressPercent: number;
  reps: number;
  requiredReps: number;
  /** 화면에 띄울 짧은 안내 */
  hint: string;
}

interface Options {
  videoRef: RefObject<HTMLVideoElement | null>;
  /** 스트레칭 화면이 떠 있는 동안 true */
  active: boolean;
  /** 수행할 동작 이름 (stretchings.name) */
  stretchingName: string | null;
  /** 유지 시간(초) — stretchings.hold_seconds */
  holdSeconds: number;
  /** 개인 기준선. 있으면 어깨 높이 기준으로 사용한다 */
  personalBaseline: PostureBaseline | null;
  /** 이번 시도를 처음부터 다시 (재도전) */
  attemptKey: number;
}

const IDLE: StretchDetectionState = {
  supported: false,
  preparing: false,
  progressPercent: 0,
  reps: 0,
  requiredReps: 0,
  hint: '',
};

export function useStretchDetection({
  videoRef,
  active,
  stretchingName,
  holdSeconds,
  personalBaseline,
  attemptKey,
}: Options): StretchDetectionState {
  const [state, setState] = useState<StretchDetectionState>(IDLE);

  // 매 프레임 setState 하면 리렌더가 폭주한다. 값이 바뀔 때만 반영한다.
  const lastRef = useRef<StretchDetectionState>(IDLE);

  useEffect(() => {
    if (!active || !stretchingName) {
      lastRef.current = IDLE;
      setState(IDLE);
      return;
    }

    const detector: StretchDetector | null =
      createStretchDetector(stretchingName);
    if (!detector) {
      // 판정기가 없는 동작 — 호출부가 알 수 있게 supported=false 로 알린다
      console.warn(`[stretching] '${stretchingName}' 판정기가 없습니다`);
      const unsupported = { ...IDLE, supported: false };
      lastRef.current = unsupported;
      setState(unsupported);
      return;
    }

    let cancelled = false;
    let rafId = 0;
    let lastVideoTime = -1;
    let baseline: StretchBaseline | null = null;
    const baselineSamples: PoseMetrics[] = [];
    // 기준선 수집과 판정 모두 평활화된 값을 쓴다 (파이썬도 캘리브레이션부터 평활값 사용)
    const smooth = createSmoother();
    let startedAt = 0;

    function apply(next: StretchDetectionState) {
      const prev = lastRef.current;
      if (
        prev.progressPercent === next.progressPercent &&
        prev.reps === next.reps &&
        prev.hint === next.hint &&
        prev.preparing === next.preparing &&
        prev.supported === next.supported
      ) {
        return;
      }
      lastRef.current = next;
      setState(next);
    }

    apply({
      supported: true,
      preparing: true,
      progressPercent: 0,
      reps: 0,
      requiredReps: detector.requiredReps,
      hint: '시작 자세를 잡아주세요',
    });

    (async () => {
      let landmarker: Awaited<ReturnType<typeof getPoseLandmarker>>;
      try {
        landmarker = await getPoseLandmarker();
      } catch (e) {
        console.error('[stretching] PoseLandmarker 로드 실패', e);
        return;
      }
      if (cancelled) return;
      startedAt = performance.now();

      function loop() {
        if (cancelled) return;
        const video = videoRef.current;

        if (!video || video.readyState < 2 || video.videoWidth === 0) {
          rafId = requestAnimationFrame(loop);
          return;
        }

        // 같은 프레임을 두 번 추론하지 않는다 (detectForVideo 요구사항)
        if (video.currentTime !== lastVideoTime) {
          lastVideoTime = video.currentTime;
          const now = performance.now();
          const result = landmarker.detectForVideo(video, now);
          const lms = result.landmarks?.[0];
          const raw = lms
            ? computeMetrics(lms, video.videoWidth, video.videoHeight)
            : null;
          const m = raw ? smooth(raw) : null;

          if (!m || !lms) {
            apply({
              ...lastRef.current,
              hint: '화면에 어깨와 얼굴이 보이도록 앉아주세요',
            });
          } else if (baseline === null) {
            baselineSamples.push(m);
            if (now - startedAt >= BASELINE_MS) {
              if (baselineSamples.length >= MIN_BASELINE_SAMPLES) {
                baseline = buildStretchBaseline(baselineSamples);
                // 어깨 높이는 개인 기준선이 더 믿을 만하다.
                // 방금 2초가 이미 어깨를 올린 상태였다면 시작 자세가 오염되기 때문이다.
                if (personalBaseline) {
                  baseline.earShoulderGapLeft =
                    personalBaseline.earShoulderVerticalRatio;
                  baseline.earShoulderGapRight =
                    personalBaseline.earShoulderVerticalRatio;
                }
              } else {
                // 표본이 부족하면 시간을 더 준다
                startedAt = now;
              }
            }
          } else {
            const tick = detector!.update({
              m,
              lms,
              w: video.videoWidth,
              h: video.videoHeight,
              now,
              base: baseline,
              holdSeconds,
            });
            const required = detector!.requiredReps;
            // 완료 횟수 + 진행 중인 회차의 진행도를 합쳐 0~100 으로 만든다.
            //
            // 100%는 "실제로 requiredReps 를 채웠을 때"만 준다.
            // 마지막 회차를 거의 다 한 상태(진행도 1)를 완료로 쳐버리면
            // 동작을 끝맺지 않았는데 스트레칭이 통과된다.
            const ratio =
              tick.reps >= required
                ? 1
                : Math.min(
                    0.99,
                    (tick.reps + Math.min(tick.repProgress, 1)) / required,
                  );
            apply({
              supported: true,
              preparing: false,
              progressPercent: Math.round(ratio * 100),
              reps: tick.reps,
              requiredReps: required,
              hint: tick.hint,
            });
          }
        }

        rafId = requestAnimationFrame(loop);
      }

      loop();
    })();

    return () => {
      cancelled = true;
      cancelAnimationFrame(rafId);
    };
  }, [
    active,
    stretchingName,
    holdSeconds,
    personalBaseline,
    attemptKey,
    videoRef,
  ]);

  return state;
}
