// src/hooks/usePoseGuideOverlay.ts
import { useCallback, useEffect, useRef } from 'react';
import type { RefObject } from 'react';

import type { PosePreviewFrame } from '@/hooks/usePostureDetection';
import type { DetectionStatus } from '@/types/posture';

/** 코 · 양 귀 · 양 어깨. MediaPipe Pose 의 번호다 */
const NOSE = 0;
const EAR_L = 7;
const EAR_R = 8;
const SHOULDER_L = 11;
const SHOULDER_R = 12;

/** 이보다 흐릿하게 잡힌 점은 그리지 않는다 */
const MIN_VISIBILITY = 0.5;

/**
 * 시간 평활 계수 (0~1). 1 이면 평활하지 않는다.
 *
 * 랜드마크는 가만히 있어도 프레임마다 1~2px 씩 흔들린다. 그대로 그리면 선이 계속 떨려서
 * "내가 움직여서 그런가" 하고 자꾸 자세를 고치게 된다. 낮출수록 안정적이지만 실제로
 * 움직일 때 선이 늦게 따라온다.
 */
const SMOOTHING = 0.35;

/** 귀 간격으로 머리 원의 반지름을 잡을 때 곱하는 값. 귀보다 머리가 넓다 */
const HEAD_RADIUS_FROM_EARS = 0.95;
/** 귀가 안 잡혔을 때 어깨너비로 대신 잡는 비율 */
const HEAD_RADIUS_FROM_SHOULDER = 0.26;

/**
 * 상태별 선 색. CSS 토큰과 같은 값이다(캔버스는 var() 를 읽지 못한다).
 * 토큰을 바꾸면 여기도 같이 고칠 것 — variables.css 의 --gak-status-* 참고.
 */
const LINE_COLOR: Record<DetectionStatus, string> = {
  'not-found': '#f04652',
  detecting: '#ffffff',
  verified: '#1bbb05',
};

interface Point {
  x: number;
  y: number;
}

/**
 * 표시 영역에서의 좌표로 옮긴다.
 *
 * <p>
 * 두 가지를 같이 처리해야 한다. 하나는 <b>거울 반전</b>(preview-video 의 scaleX(-1)) —
 * 화면에 보이는 왼쪽이 원본의 오른쪽이라 x 를 1 에서 뺀다. 다른 하나는
 * <b>object-fit: cover</b> 다. 미리보기 상자는 16:10 인데 카메라는 16:9 라, 높이를 채우고
 * 좌우가 잘린다. 잘린 만큼 빼 주지 않으면 선이 실제 어깨보다 바깥에 그려진다.
 */
function toDisplay(
  point: { x: number; y: number },
  frame: PosePreviewFrame,
  boxWidth: number,
  boxHeight: number,
): Point {
  const scale = Math.max(boxWidth / frame.width, boxHeight / frame.height);
  const shownWidth = frame.width * scale;
  const shownHeight = frame.height * scale;
  return {
    x: (1 - point.x) * shownWidth - (shownWidth - boxWidth) / 2,
    y: point.y * shownHeight - (shownHeight - boxHeight) / 2,
  };
}

/** 이전 값과 섞는다. 처음이면 그대로 받는다 */
function smooth(prev: Point | null, next: Point): Point {
  if (!prev) return next;
  return {
    x: prev.x + (next.x - prev.x) * SMOOTHING,
    y: prev.y + (next.y - prev.y) * SMOOTHING,
  };
}

/**
 * 준비 화면의 '내 라인'을 캔버스에 그린다 — 머리 원과 어깨선.
 *
 * <p>
 * 점선 가이드(고정 목표)는 CSS 가 그대로 그리고, 여기서는 <b>지금 내 위치</b>만 얹는다.
 * 둘을 겹치라고 말할 수 있으려면 목표는 움직이지 않아야 한다 — 가이드가 내 몸을 따라
 * 변형되면 늘 맞아 있는 셈이라 어디로 가라는 지시를 할 수 없다.
 *
 * <p>
 * 어깨선을 <b>직선</b>으로 그리는 데는 이유가 있다. 통과 조건 중 하나가 어깨 기울기라서,
 * 목표(수평)와 내 선(기울어진 만큼)이 눈으로 바로 비교된다. 점선 아치 안에 들어왔는지와
 * 별개로 "한쪽이 올라가 있다"가 보인다.
 *
 * <p>
 * 자세 추론 루프(usePoseStream)와 별도로 rAF 를 돈다. 여기서 하는 일은 픽셀을 읽지도
 * 추론하지도 않고 선 두 개를 긋는 것뿐이라 비용이 거의 없다. 대신 그 덕에 추론이 잠깐
 * 밀려도 화면은 부드럽게 이어진다.
 */
export function usePoseGuideOverlay(
  poseRef: RefObject<PosePreviewFrame | null>,
  status: DetectionStatus,
): (el: HTMLCanvasElement | null) => void {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const statusRef = useRef(status);
  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  /** 평활된 이전 프레임의 점들 */
  const prevRef = useRef<{
    head: Point | null;
    left: Point | null;
    right: Point | null;
    radius: number | null;
  }>({ head: null, left: null, right: null, radius: null });

  const attachCanvas = useCallback((el: HTMLCanvasElement | null) => {
    canvasRef.current = el;
    // 요소가 떨어지면 평활 값도 버린다. 남겨 두면 다시 붙었을 때 옛 자리에서 선이 날아온다.
    if (!el)
      prevRef.current = { head: null, left: null, right: null, radius: null };
  }, []);

  useEffect(() => {
    let rafId = 0;
    let cancelled = false;

    function draw() {
      if (cancelled) return;
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext('2d');
      if (!canvas || !ctx) {
        rafId = requestAnimationFrame(draw);
        return;
      }

      // 표시 크기가 바뀌면 해상도를 다시 맞춘다. devicePixelRatio 를 곱하지 않으면
      // 고해상도 화면에서 선이 뿌옇게 번진다.
      const dpr = window.devicePixelRatio || 1;
      const boxWidth = canvas.clientWidth;
      const boxHeight = canvas.clientHeight;
      const wantWidth = Math.round(boxWidth * dpr);
      const wantHeight = Math.round(boxHeight * dpr);
      if (canvas.width !== wantWidth || canvas.height !== wantHeight) {
        canvas.width = wantWidth;
        canvas.height = wantHeight;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, boxWidth, boxHeight);

      const frame = poseRef.current;
      if (!frame || boxWidth === 0) {
        prevRef.current = { head: null, left: null, right: null, radius: null };
        rafId = requestAnimationFrame(draw);
        return;
      }

      const { landmarks } = frame;
      const visible = (i: number) =>
        (landmarks[i]?.visibility ?? 1) >= MIN_VISIBILITY;
      if (!visible(NOSE) || !visible(SHOULDER_L) || !visible(SHOULDER_R)) {
        rafId = requestAnimationFrame(draw);
        return;
      }

      const prev = prevRef.current;
      const head = smooth(
        prev.head,
        toDisplay(landmarks[NOSE], frame, boxWidth, boxHeight),
      );
      // 화면 기준 좌우가 아니라 원본 기준이다. 거울이라 뒤집히지만 선을 긋는 데는
      // 어느 쪽이 어느 쪽인지가 중요하지 않다.
      const left = smooth(
        prev.left,
        toDisplay(landmarks[SHOULDER_L], frame, boxWidth, boxHeight),
      );
      const right = smooth(
        prev.right,
        toDisplay(landmarks[SHOULDER_R], frame, boxWidth, boxHeight),
      );

      const shoulderWidth = Math.hypot(right.x - left.x, right.y - left.y);
      let radius: number;
      if (visible(EAR_L) && visible(EAR_R)) {
        const earL = toDisplay(landmarks[EAR_L], frame, boxWidth, boxHeight);
        const earR = toDisplay(landmarks[EAR_R], frame, boxWidth, boxHeight);
        radius =
          Math.hypot(earR.x - earL.x, earR.y - earL.y) /
          2 /
          HEAD_RADIUS_FROM_EARS;
      } else {
        // 고개를 돌리면 한쪽 귀가 가려진다. 그때는 어깨너비로 대신 잡는다 —
        // 반지름이 0 이 되어 원이 사라지는 것보다 낫다.
        radius = shoulderWidth * HEAD_RADIUS_FROM_SHOULDER;
      }
      radius =
        prev.radius === null
          ? radius
          : prev.radius + (radius - prev.radius) * SMOOTHING;

      prevRef.current = { head, left, right, radius };

      const color = LINE_COLOR[statusRef.current];
      ctx.strokeStyle = color;
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      // 어두운 영상 위에서도 선이 묻히지 않게 옅은 그림자를 깐다.
      ctx.shadowColor = 'rgba(0, 0, 0, 0.45)';
      ctx.shadowBlur = 4;

      // 어깨선
      ctx.beginPath();
      ctx.moveTo(left.x, left.y);
      ctx.lineTo(right.x, right.y);
      ctx.stroke();

      // 어깨 끝점 — 선만 있으면 어디까지가 내 어깨인지 눈에 안 들어온다
      for (const point of [left, right]) {
        ctx.beginPath();
        ctx.arc(point.x, point.y, 4, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();
      }

      // 머리 원
      ctx.beginPath();
      ctx.arc(head.x, head.y, radius, 0, Math.PI * 2);
      ctx.stroke();

      rafId = requestAnimationFrame(draw);
    }

    rafId = requestAnimationFrame(draw);
    return () => {
      cancelled = true;
      cancelAnimationFrame(rafId);
    };
  }, [poseRef]);

  return attachCanvas;
}
