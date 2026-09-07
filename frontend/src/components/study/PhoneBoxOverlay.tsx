// 감지된 휴대폰 위치를 얇은 검은 선으로 표시한다 (확인용).
//
// 좌표 변환이 필요한 이유:
//   - 모델은 "영상 원본 픽셀"(예: 1280x720) 기준으로 박스를 준다.
//   - 화면의 <video> 는 크기에 맞춰 잘리거나(cover) 여백이 생기고(contain), scaleX(-1) 로
//     좌우가 뒤집혀 있다.
//   그래서 원본 좌표 → 화면 좌표로 직접 계산해야 박스가 실제 폰 위에 얹힌다.
//
// 이 오버레이는 그리드 타일(contain)과 코칭 화면(cover) 양쪽에 붙는다. 둘 중 어느 쪽인지
// 하드코딩하면 한쪽에서 박스가 어긋나므로, 실제 적용된 object-fit 을 읽어서 맞춘다.
import { useEffect, useState } from 'react';
import type { RefObject } from 'react';

import type { PhoneBox } from '@/hooks/usePhoneDetection';

interface Props {
  videoRef: RefObject<HTMLVideoElement | null>;
  box: PhoneBox | null;
}

interface ScreenRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** 영상 원본 좌표를 화면(viewport) 좌표로 변환한다 */
function toScreenRect(
  video: HTMLVideoElement,
  box: PhoneBox,
): ScreenRect | null {
  const rect = video.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return null;

  // cover 는 짧은 쪽을 채우고 긴 쪽을 자른다. contain 은 반대로 긴 쪽을 맞추고 여백을 남긴다.
  const fitsInside = getComputedStyle(video).objectFit === 'contain';
  const scaleX = rect.width / box.videoWidth;
  const scaleY = rect.height / box.videoHeight;
  const scale = fitsInside
    ? Math.min(scaleX, scaleY)
    : Math.max(scaleX, scaleY);

  const shownWidth = box.videoWidth * scale;
  const shownHeight = box.videoHeight * scale;
  // 가운데 정렬 기준 오프셋. cover 면 잘려나간 만큼 음수, contain 이면 여백만큼 양수가 된다.
  const offsetX = (rect.width - shownWidth) / 2;
  const offsetY = (rect.height - shownHeight) / 2;

  const width = box.width * scale;
  const height = box.height * scale;
  const localX = offsetX + box.x * scale;
  const localY = offsetY + box.y * scale;

  // scaleX(-1) 로 좌우 반전돼 있으므로 x 를 뒤집는다
  const mirroredX = rect.width - (localX + width);

  return {
    left: rect.left + mirroredX,
    top: rect.top + localY,
    width,
    height,
  };
}

export default function PhoneBoxOverlay({ videoRef, box }: Props) {
  const [screen, setScreen] = useState<ScreenRect | null>(null);

  // 스크롤·리사이즈·레이아웃 변경에도 박스가 따라가도록 매 프레임 위치를 다시 계산한다.
  // (확인용 오버레이라 단순함을 우선했다)
  useEffect(() => {
    // 박스가 없으면 루프를 돌리지 않는다. (state 정리는 렌더에서 box 로 판단하므로 불필요)
    if (!box) return;
    const target = box; // 클로저 안에서 null 이 아님을 보장

    let rafId = 0;
    let cancelled = false;

    function update() {
      if (cancelled) return;
      const video = videoRef.current;
      setScreen(video ? toScreenRect(video, target) : null);
      rafId = requestAnimationFrame(update);
    }
    rafId = requestAnimationFrame(update);

    return () => {
      cancelled = true;
      cancelAnimationFrame(rafId);
    };
  }, [box, videoRef]);

  // box 가 사라지면 이전 위치가 남아 있어도 그리지 않는다
  if (!box || !screen) return null;

  return (
    <div
      aria-hidden
      style={{
        position: 'fixed',
        left: screen.left,
        top: screen.top,
        width: screen.width,
        height: screen.height,
        border: '1px solid #000',
        pointerEvents: 'none',
        zIndex: 'var(--gak-z-badge, 20)' as unknown as number,
      }}
    />
  );
}
