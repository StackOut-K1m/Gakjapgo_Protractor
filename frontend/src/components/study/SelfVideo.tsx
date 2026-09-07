// src/components/study/SelfVideo.tsx
import type { CanvasRefCallback, VideoRefCallback } from '@/types/video';
import styles from './SelfVideo.module.css';

interface SelfVideoProps {
  attachVideo: VideoRefCallback;
  /**
   * 배경 효과 캔버스를 붙이는 콜백. null 이면 효과가 꺼진 것이라 캔버스를 그리지 않는다.
   */
  attachEffectCanvas?: CanvasRefCallback | null;
  /**
   * 이 화면의 영상 클래스.
   *
   * 캔버스도 <b>같은 클래스</b>를 받는다. 화면마다 맞춤 방식이 달라서(코칭 화면은 cover,
   * 타일과 작은 창은 contain) 여기서 값을 따로 적으면 어느 한쪽이 반드시 어긋난다.
   * 좌우 반전도 마찬가지다 — 영상이 거울인데 캔버스가 아니면 배경만 뒤집힌다.
   */
  className: string;
}

/**
 * 내 카메라 영상 + 배경 효과 캔버스.
 *
 * <p>
 * 영상을 효과가 걸린 것으로 <b>갈아 끼우지 않고</b> 그 위에 캔버스를 덮는 이유는,
 * 이 &lt;video&gt; 가 자세·졸음·휴대폰 판정이 읽는 바로 그 요소이기 때문이다.
 * 자세한 사정은 useBackgroundEffect 주석에 있다.
 *
 * <p>
 * 효과가 꺼져 있으면 캔버스는 아예 그려지지 않으므로, 예전과 완전히 같은 화면이 된다.
 */
export default function SelfVideo({
  attachVideo,
  attachEffectCanvas,
  className,
}: SelfVideoProps) {
  return (
    <>
      <video
        ref={attachVideo}
        autoPlay
        playsInline
        muted
        className={className}
      />

      {attachEffectCanvas && (
        <canvas
          ref={attachEffectCanvas}
          className={`${className} ${styles['effect-canvas']}`}
          // 읽어 줄 내용이 없다. 아래 영상과 같은 그림이라 두 번 알릴 것도 없다.
          aria-hidden
        />
      )}
    </>
  );
}
