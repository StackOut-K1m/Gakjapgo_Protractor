// src/hooks/usePoseStream.ts
import { useEffect, useRef } from 'react';
import type { RefObject } from 'react';
import type { NormalizedLandmark } from '@mediapipe/tasks-vision';

import { getPoseLandmarker } from '@/lib/pose/poseLandmarker';

/** 프레임마다 호출된다. 사람이 안 잡힌 프레임은 landmarks 가 null 이다. */
export type PoseFrameHandler = (
  landmarks: NormalizedLandmark[] | null,
  width: number,
  height: number,
) => void;

/**
 * 공용 PoseLandmarker 를 requestAnimationFrame 으로 돌리는 단일 루프.
 *
 * 랜드마커는 싱글턴이라 한 화면에서 루프를 두 개 돌리면 같은 프레임을 두 번 추론하게 되고,
 * detectForVideo 가 요구하는 타임스탬프 단조 증가도 깨진다. 그래서 자세 판정과 서버 전송이
 * 각자 루프를 갖지 않고 이 훅 하나의 추론 결과를 나눠 쓴다.
 *
 * onFrame 은 초당 30회 호출되므로 안에서 setState 를 그대로 부르면 안 된다.
 * ref 에 쌓아 두고 값이 실제로 바뀔 때만 setState 하는 식으로 써야 한다.
 */
export function usePoseStream(
  videoRef: RefObject<HTMLVideoElement | null>,
  enabled: boolean,
  onFrame: PoseFrameHandler,
  onLoadError?: () => void,
): void {
  // 콜백이 매 렌더 새로 만들어져도 루프를 다시 시작하지 않는다.
  // 콜백을 의존성에 직접 넣으면 렌더마다 랜드마커를 다시 붙였다 떼게 된다.
  const handlerRef = useRef(onFrame);
  const errorRef = useRef(onLoadError);

  useEffect(() => {
    handlerRef.current = onFrame;
    errorRef.current = onLoadError;
  }, [onFrame, onLoadError]);

  useEffect(() => {
    if (!enabled) return;

    let rafId = 0;
    let cancelled = false;
    let lastVideoTime = -1;
    /** 지금 rafId 를 발급한 창. 취소는 발급한 창에 해야 한다 */
    let rafView: Window = window;

    (async () => {
      let landmarker: Awaited<ReturnType<typeof getPoseLandmarker>>;
      try {
        landmarker = await getPoseLandmarker();
      } catch (e) {
        console.error('[pose] PoseLandmarker 로드 실패', e);
        if (!cancelled) errorRef.current?.();
        return;
      }
      if (cancelled) return;

      /**
       * 다음 프레임을 예약한다.
       *
       * <p>
       * requestAnimationFrame 은 그 창이 화면에 그려질 때만 돈다. 사용자가 다른 창으로
       * 넘어가 스터디룸이 가려지면 이 창의 rAF 는 사실상 멈추고, 자세 판정도 같이 멈춘다.
       * 작은 창(PiP)을 켜면 &lt;video&gt; 가 그 창으로 옮겨가는데, PiP 창은 늘 맨 위에 떠
       * 있어 계속 그려진다. 그래서 예약은 항상 <b>지금 영상이 들어 있는 창</b>에 건다 —
       * 자리를 비운 사이에도 판정이 이어져야 작은 창의 경고가 의미를 갖는다.
       */
      function schedule() {
        const view = videoRef.current?.ownerDocument.defaultView ?? window;
        rafView = view;
        rafId = view.requestAnimationFrame(loop);
      }

      function loop() {
        if (cancelled) return;
        const video = videoRef.current;

        if (!video || video.readyState < 2 || video.videoWidth === 0) {
          schedule();
          return;
        }

        // 같은 프레임을 두 번 추론하지 않는다 (detectForVideo 요구사항)
        if (video.currentTime !== lastVideoTime) {
          lastVideoTime = video.currentTime;

          // 동기 함수
          const result = landmarker.detectForVideo(video, performance.now());
          handlerRef.current(
            result.landmarks?.[0] ?? null,
            video.videoWidth,
            video.videoHeight,
          );
        }

        schedule();
      }

      schedule();
    })();

    return () => {
      cancelled = true;
      rafView.cancelAnimationFrame(rafId);
    };
  }, [enabled, videoRef]);
}
