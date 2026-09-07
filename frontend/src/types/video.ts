// src/types/video.ts

/** useCamera().attachVideo 의 타입 */
export type VideoRefCallback = (el: HTMLVideoElement | null) => void;

/**
 * useBackgroundEffect().attachCanvas 의 타입.
 *
 * 영상과 마찬가지로 콜백 ref 다 — 배경 효과 캔버스도 화면 전환(타일 ↔ 코칭 ↔ 작은 창)에
 * 따라 요소가 갈아 끼워지므로, 붙을 때마다 다시 잡아야 한다.
 */
export type CanvasRefCallback = (el: HTMLCanvasElement | null) => void;
