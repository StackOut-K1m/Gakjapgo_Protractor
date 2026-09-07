// src/hooks/useBackgroundEffect.ts
import { useCallback, useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';

import type { PoseFrameHandler } from '@/hooks/usePoseStream';
import { createPersonMaskFilter } from '@/lib/vision/personMask';
import type { MaskAnchor } from '@/lib/vision/personMask';
import { getSelfieSegmenter } from '@/lib/vision/selfieSegmenter';
import type { CanvasRefCallback } from '@/types/video';
import { BACKGROUND_BLUR_RADIUS } from '@/utils/backgroundEffect';
import type { BackgroundEffect } from '@/utils/backgroundEffect';

/**
 * 합성 캔버스의 가로 폭(px).
 *
 * 송출 해상도(640x360, useOpenVidu 의 PUBLISHER_OPTIONS)에 맞춘다. 더 크게 그려도 상대에게
 * 갈 때 어차피 줄어들고, 흐림 처리는 픽셀 수에 그대로 비례해서 비싸진다. 내 타일에서는
 * 조금 확대되지만, 상대가 보는 것과 같은 그림을 보는 편이 오히려 낫다 — 여기서 괜찮아
 * 보이는데 상대 화면에서는 배경이 덜 지워지는 상황을 만들지 않는다.
 */
const RENDER_WIDTH = 640;

/**
 * 초당 합성 횟수.
 *
 * 화면 주사율(보통 60)만큼 돌리지 않는다. 이 합성은 자세 추론과 같은 메인 스레드·같은 GPU 를
 * 쓰기 때문에, 여기서 욕심을 내면 정작 자세 판정이 밀린다. 사람이 앉아서 공부하는 영상은
 * 움직임이 크지 않아 20fps 로도 끊겨 보이지 않는다.
 */
const RENDER_FPS = 20;

/**
 * 사람 경계에 먹이는 흐림(px).
 *
 * 마스크는 256x144 로 나와서 640 폭으로 늘리면 경계가 계단처럼 진다. 살짝 번지게 해서
 * 오려 붙인 티를 줄인다.
 */
const EDGE_BLUR_PX = 2;

/**
 * 카테고리 마스크에서 사람을 가리키는 값.
 *
 * ⚠️ 모델 카드에는 분류가 ["background", "person"] 순서로 적혀 있어서 0 이 배경일 것 같지만,
 * selfie_segmenter_landscape 를 실제로 돌려 보면 <b>0 이 사람</b>이다. 뒤집어 두면 사람만
 * 흐려지고 배경이 선명해진다 — 화면을 보면 바로 알 수 있는 종류의 실수이니, 모델을 바꾸게
 * 되면 여기부터 눈으로 확인할 것.
 */
const PERSON_CATEGORY = 0;

/**
 * '나'를 찍는 데 쓸 포즈 랜드마크 번호 — 코, 양 어깨, 양 골반.
 *
 * 머리부터 골반까지 흩어 두는 이유는 몸이 한 덩어리로 잡히지 않는 경우 때문이다. 책이나
 * 모니터가 몸통을 가리면 머리와 하체가 따로 떨어지는데, 그때도 양쪽 모두 남는다.
 * 손목·팔꿈치는 넣지 않았다 — 팔은 화면 밖으로 자주 나가고 잘못 잡히는 일도 잦다.
 */
const ANCHOR_LANDMARKS = [0, 11, 12, 23, 24];

/** 이보다 흐릿하게 잡힌 점은 믿지 않는다 */
const ANCHOR_MIN_VISIBILITY = 0.5;

/**
 * 랜드마크를 이 시간(ms)보다 오래 못 받으면 없는 셈 친다.
 *
 * 자세 판정은 스트레칭 중이나 카메라가 꺼졌을 때 멈춘다(usePostureFrames). 그때는 옛 위치를
 * 계속 쓰는 대신 "가장 큰 덩어리"로 조용히 넘어가는 편이 낫다 — 낡은 점을 붙들고 있으면
 * 사람이 자리를 옮겼을 때 엉뚱한 덩어리를 나라고 우기게 된다.
 */
const ANCHOR_MAX_AGE_MS = 1000;

export type BackgroundEffectStatus = 'idle' | 'loading' | 'ready' | 'error';

export interface BackgroundEffectHandle {
  /**
   * 효과 캔버스를 붙이는 콜백 ref. null 이면 붙일 캔버스가 없다는 뜻이라
   * 화면은 캔버스를 그리지 않고 원래 영상만 보여준다.
   */
  attachCanvas: CanvasRefCallback | null;
  status: BackgroundEffectStatus;
  /** 상대에게 내보낼 트랙. 효과가 꺼져 있거나 아직 첫 프레임 전이면 null */
  track: MediaStreamTrack | null;
  /**
   * 자세 판정의 랜드마크를 나눠 받는 자리 (usePostureFrames 의 onLandmarks 에 연결한다).
   *
   * 여러 사람이 잡혔을 때 어느 덩어리가 나인지 고르는 데 쓴다. 연결하지 않아도 동작은
   * 한다 — 그때는 가장 큰 덩어리를 나로 본다.
   */
  onLandmarks: PoseFrameHandler;
}

/** 합성에 쓰는 세 판의 2D 컨텍스트. 하나라도 못 얻으면 null 이다. */
function getContexts(
  out: HTMLCanvasElement,
  person: HTMLCanvasElement,
  mask: HTMLCanvasElement,
): {
  outCtx: CanvasRenderingContext2D;
  personCtx: CanvasRenderingContext2D;
  maskCtx: CanvasRenderingContext2D;
} | null {
  const outCtx = out.getContext('2d');
  const personCtx = person.getContext('2d');
  const maskCtx = mask.getContext('2d');
  if (!outCtx || !personCtx || !maskCtx) return null;
  return { outCtx, personCtx, maskCtx };
}

/** 캔버스 크기를 맞춘다. 같은 값이면 건드리지 않는다 — 대입만 해도 내용이 지워진다. */
function fit(canvas: HTMLCanvasElement, width: number, height: number): void {
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
}

/**
 * 사람만 남기고 배경을 흐리게 만든다.
 *
 * <p>
 * <b>원본 &lt;video&gt; 는 건드리지 않는다.</b> 대신 합성 결과를 담은 캔버스를 영상 위에
 * 덮는다. 자세·졸음·휴대폰 판정이 모두 그 &lt;video&gt; 의 프레임을 읽고 있어서다 —
 * 영상 자체를 흐린 것으로 갈아 끼우면 배경에 있는 물체(대표적으로 손에 든 휴대폰)가
 * 뭉개져서, 화면은 멀쩡해 보이는데 감지만 조용히 나빠진다.
 *
 * <p>
 * 그리는 곳은 두 군데다. 화면 밖 캔버스에 합성한 뒤 그것을 화면에 붙은 캔버스로 한 번
 * 복사한다. 굳이 나눈 이유는 송출 때문이다 — captureStream 은 특정 캔버스 요소에 붙는데,
 * 화면에 붙은 캔버스는 타일 ↔ 코칭 ↔ 작은 창을 오갈 때마다 갈아 끼워진다. 그때마다
 * 송출 트랙이 죽으면 상대 화면에서 내 영상이 멈춘다.
 *
 * @param videoRef 원본 카메라 영상. 이 프레임을 읽어 합성한다
 * @param effect   지금 고른 효과. 흐림 정도만 바뀔 때는 루프를 다시 만들지 않는다
 * @param cameraOn 카메라가 켜져 있는지. 꺼져 있으면 합성을 쉰다(트랙은 살려 둔다)
 */
export function useBackgroundEffect(
  videoRef: RefObject<HTMLVideoElement | null>,
  effect: BackgroundEffect,
  cameraOn: boolean,
): BackgroundEffectHandle {
  const active = effect !== 'off';

  /**
   * 모델 적재 결과. 'pending' 은 아직 결과가 없다는 뜻이다.
   *
   * 효과 안에서 동기 setState 를 하지 않으려고 상태를 이렇게 나눴다(프로젝트 린트 규칙
   * react-hooks/set-state-in-effect). 화면에 필요한 status 는 이 값과 active 로 아래에서 만든다.
   */
  const [loadState, setLoadState] = useState<'pending' | 'ready' | 'error'>(
    'pending',
  );
  const [track, setTrack] = useState<MediaStreamTrack | null>(null);

  /** 화면에 붙은 캔버스와 그 컨텍스트. 요소가 바뀔 때 함께 갱신한다 */
  const visibleRef = useRef<HTMLCanvasElement | null>(null);
  const visibleCtxRef = useRef<CanvasRenderingContext2D | null>(null);

  // 렌더 중에 ref 를 건드리면 안 되므로 갱신은 효과에서 한다(usePoseStream 과 같은 방식).
  // 흐림 정도와 카메라 상태는 매 프레임 읽기만 하므로, 바뀌었다고 루프를 다시 만들 이유가 없다.
  const effectRef = useRef(effect);
  const cameraOnRef = useRef(cameraOn);
  useEffect(() => {
    effectRef.current = effect;
    cameraOnRef.current = cameraOn;
  }, [effect, cameraOn]);

  const attachCanvas = useCallback((el: HTMLCanvasElement | null) => {
    visibleRef.current = el;
    visibleCtxRef.current = el?.getContext('2d') ?? null;
  }, []);

  /** 내 위치를 찍는 점들과 그 시각. 배열은 갈아 끼우지 않고 안을 비웠다 채운다 */
  const anchorsRef = useRef<MaskAnchor[]>([]);
  const anchorAtRef = useRef(0);

  const onLandmarks = useCallback<PoseFrameHandler>((landmarks) => {
    const anchors = anchorsRef.current;
    anchors.length = 0;
    if (!landmarks) return;

    for (const index of ANCHOR_LANDMARKS) {
      const point = landmarks[index];
      if (!point) continue;
      // visibility 는 모델이 안 채우는 경우가 있어 없으면 믿고 쓴다.
      if ((point.visibility ?? 1) < ANCHOR_MIN_VISIBILITY) continue;
      anchors.push({ x: point.x, y: point.y });
    }

    // 사람이 안 잡힌 프레임에서는 시각을 갱신하지 않는다. 그대로 두면 곧 만료되어
    // "가장 큰 덩어리" 쪽으로 넘어간다.
    if (anchors.length > 0) anchorAtRef.current = performance.now();
  }, []);

  useEffect(() => {
    if (!active) return;

    let cancelled = false;
    let rafId = 0;
    /** 지금 rafId 를 발급한 창. 취소는 발급한 창에 해야 한다 */
    let rafView: Window = window;
    let lastDrawnAt = 0;
    let stream: MediaStream | null = null;

    // 화면 밖 판들. DOM 에 붙이지 않아도 그리기와 captureStream 은 정상 동작한다.
    const out = document.createElement('canvas');
    const person = document.createElement('canvas');
    const mask = document.createElement('canvas');
    /** 마스크를 캔버스로 옮길 때 쓰는 버퍼. 매 프레임 새로 만들지 않는다 */
    let maskImage: ImageData | null = null;
    /** 뒤에 있는 사람을 걸러내고 내 덩어리만 남긴다 */
    const maskFilter = createPersonMaskFilter();

    (async () => {
      let segmenter: Awaited<ReturnType<typeof getSelfieSegmenter>>;
      try {
        segmenter = await getSelfieSegmenter();
      } catch (e) {
        console.error('[배경 효과] 세그멘테이션 모델을 불러오지 못했습니다', e);
        if (!cancelled) setLoadState('error');
        return;
      }
      if (cancelled) return;

      // 한 덩어리로 받는다. 셋을 따로 확인하면 아래 drawFrame 안에서 "null 일 수도 있다"가
      // 되살아난다 — 검사는 이 함수에서 했지만 그리는 건 다른 함수라, 타입 검사기는 그
      // 사이에 값이 바뀌지 않는다고 볼 근거가 없다.
      const contexts = getContexts(out, person, mask);
      if (!contexts) {
        console.error('[배경 효과] 2D 캔버스를 만들 수 없습니다.');
        setLoadState('error');
        return;
      }
      const { outCtx, personCtx, maskCtx } = contexts;

      setLoadState('ready');

      /** 한 프레임 합성. 그릴 것이 없었으면 false */
      function drawFrame(): boolean {
        const video = videoRef.current;
        if (!video || video.readyState < 2 || video.videoWidth === 0)
          return false;

        // 캔버스는 영상 위에 겹쳐 놓이고 크기·맞춤(object-fit)은 영상과 같은 CSS 를 받는다.
        // 그래서 비율이 어긋나면 둘이 다른 자리에 놓여 배경만 밀린 것처럼 보인다.
        // 16:9 를 요청해도 4:3 으로 주는 기기가 있어서 폭만 고정하고 높이는 따라간다.
        const width = RENDER_WIDTH;
        const height = Math.max(
          1,
          Math.round((video.videoHeight / video.videoWidth) * width),
        );
        fit(out, width, height);
        fit(person, width, height);

        const result = segmenter.segmentForVideo(video, performance.now());
        try {
          const category = result.categoryMask;
          if (!category) return false;

          const values = category.getAsUint8Array();
          fit(mask, category.width, category.height);
          if (
            !maskImage ||
            maskImage.width !== category.width ||
            maskImage.height !== category.height
          ) {
            maskImage = maskCtx.createImageData(
              category.width,
              category.height,
            );
          }

          // 뒤에 있는 사람을 떼어내고 내 덩어리만 남긴다. 랜드마크가 낡았으면 넘기지
          // 않는다 — 그때는 필터가 가장 큰 덩어리를 나로 본다.
          const anchors =
            anchorsRef.current.length > 0 &&
            performance.now() - anchorAtRef.current <= ANCHOR_MAX_AGE_MS
              ? anchorsRef.current
              : null;
          const solved = maskFilter.run(
            values,
            category.width,
            category.height,
            PERSON_CATEGORY,
            anchors,
          );

          // 마스크를 흰색 + 알파로 옮긴다. 아래에서 destination-in 으로 오려낼 때
          // 색은 쓰이지 않고 알파만 쓰인다.
          const pixels = maskImage.data;
          for (let i = 0; i < solved.length; i += 1) {
            const at = i * 4;
            pixels[at] = 255;
            pixels[at + 1] = 255;
            pixels[at + 2] = 255;
            pixels[at + 3] = solved[i];
          }
          maskCtx.putImageData(maskImage, 0, 0);
        } finally {
          // 마스크는 GPU 자원을 물고 있다. 닫지 않으면 몇 초 만에 메모리가 불어난다.
          result.close();
        }

        const radius = BACKGROUND_BLUR_RADIUS[effectRef.current];

        // ① 사람만 오려낸 판
        personCtx.globalCompositeOperation = 'copy';
        personCtx.filter = 'none';
        personCtx.drawImage(video, 0, 0, width, height);
        personCtx.globalCompositeOperation = 'destination-in';
        personCtx.filter = `blur(${EDGE_BLUR_PX}px)`;
        personCtx.drawImage(mask, 0, 0, width, height);

        // ② 흐린 배경 위에 ①을 얹는다.
        // 영상을 캔버스보다 조금 크게 그리는 이유는, 흐림이 캔버스 바깥의 '없는 픽셀'까지
        // 섞어서 가장자리에 어두운 테두리를 만들기 때문이다. 번지는 만큼 밖으로 밀어낸다.
        const bleed = radius * 2;
        outCtx.globalCompositeOperation = 'copy';
        outCtx.filter = `blur(${radius}px)`;
        outCtx.drawImage(
          video,
          -bleed,
          -bleed,
          width + bleed * 2,
          height + bleed * 2,
        );
        outCtx.globalCompositeOperation = 'source-over';
        outCtx.filter = 'none';
        outCtx.drawImage(person, 0, 0);

        // ③ 화면에 붙은 캔버스로 옮긴다. 붙은 캔버스가 없을 수도 있다 —
        // 스트레칭처럼 내 영상이 잠깐 사라지는 화면에서도 송출은 이어져야 한다.
        const visible = visibleRef.current;
        const visibleCtx = visibleCtxRef.current;
        if (visible && visibleCtx) {
          fit(visible, width, height);
          visibleCtx.drawImage(out, 0, 0);
        }
        return true;
      }

      function schedule() {
        // 자세 판정과 같은 이유로 '지금 화면이 들어 있는 창'에 예약한다. 작은 창(PiP)을 켜면
        // 본 창은 가려져 rAF 가 사실상 멈춘다(usePoseStream 주석 참고).
        const view =
          visibleRef.current?.ownerDocument.defaultView ??
          videoRef.current?.ownerDocument.defaultView ??
          window;
        rafView = view;
        rafId = view.requestAnimationFrame(loop);
      }

      function loop() {
        if (cancelled) return;

        const now = performance.now();

        // 카메라를 껐다 켜는 사이에 사람이 자리를 옮길 수 있다. 이전 프레임을 그대로
        // 들고 있으면 다시 켠 순간 옛 실루엣이 몇 프레임 겹쳐 보인다.
        if (!cameraOnRef.current) {
          maskFilter.reset();
        }

        // 카메라를 끄면 검은 프레임만 들어온다. 그걸 매번 추론하는 건 순수한 낭비다.
        // 루프와 트랙은 살려 둔다 — 다시 켤 때마다 트랙을 갈아 끼우면 그때마다
        // 상대 화면에서 내 영상이 한 번씩 끊긴다.
        if (cameraOnRef.current && now - lastDrawnAt >= 1000 / RENDER_FPS) {
          lastDrawnAt = now;
          const drawn = drawFrame();

          // 첫 프레임을 그린 뒤에 트랙을 만든다. 크기가 정해지기 전에 만들면
          // 상대에게 캔버스 기본 크기(300x150)로 한동안 나간다.
          if (drawn && !stream) {
            stream = out.captureStream(RENDER_FPS);
            const [videoTrack] = stream.getVideoTracks();
            if (videoTrack) setTrack(videoTrack);
          }
        }

        schedule();
      }

      schedule();
    })();

    return () => {
      cancelled = true;
      rafView.cancelAnimationFrame(rafId);
      stream?.getTracks().forEach((t) => t.stop());
      stream = null;
      setTrack(null);
    };
  }, [active, videoRef]);

  const status: BackgroundEffectStatus = !active
    ? 'idle'
    : loadState === 'ready'
      ? 'ready'
      : loadState === 'error'
        ? 'error'
        : 'loading';

  return {
    // 모델이 준비되기 전에는 캔버스를 붙이지 않는다. 아직 아무것도 그리지 않은 판을
    // 영상 위에 얹으면, 모델을 받는 몇 초 동안 빈 판이 덮인다.
    attachCanvas: status === 'ready' ? attachCanvas : null,
    status,
    track,
    onLandmarks,
  };
}
