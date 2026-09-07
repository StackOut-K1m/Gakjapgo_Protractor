// src/components/study/CameraPreview.tsx
import type { RefObject } from 'react';
import { usePoseGuideOverlay } from '@/hooks/usePoseGuideOverlay';
import type { PosePreviewFrame } from '@/hooks/usePostureDetection';
import type { CameraStatus, DetectionStatus } from '../../types/posture';
import styles from './CameraPreview.module.css';

interface CameraPreviewProps {
  videoRef: RefObject<HTMLVideoElement | null>;
  cameraStatus: CameraStatus;
  detection: DetectionStatus;
  /** 지금 인식된 내 랜드마크. 점선 위에 '내 라인'을 그리는 데 쓴다 */
  poseRef: RefObject<PosePreviewFrame | null>;
}

export default function CameraPreview({
  videoRef,
  cameraStatus,
  detection,
  poseRef,
}: CameraPreviewProps) {
  const isFailed = detection === 'not-found';
  const attachGuideCanvas = usePoseGuideOverlay(poseRef, detection);

  return (
    <div className={styles['camera-preview']} data-status={detection}>
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className={styles['preview-video']}
      />

      {/* 좌상단 라벨 */}
      <span className={styles['preview-tag']}>
        <span className={styles['record-dot']} aria-hidden />
        CAMERA CHECK
      </span>
      <span className={styles['preview-quality']}>1080p HD</span>

      {/* 고정 점선 가이드(얼굴 원 + 어깨 아치)는 걷어냈다.
          박스 비율에 박힌 도형이라 통과 조건(고개 각도·어깨 기울기)과 아무 관계가 없었고,
          "선 안에 들어가야 하나 중앙에 맞춰야 하나"만 헷갈리게 했다.
          지금은 아래 캔버스가 실제로 인식된 내 머리·어깨를 그려서 그 자체가 안내가 된다. */}

      {/* 지금 인식된 내 머리 원과 어깨선 */}
      <canvas
        ref={attachGuideCanvas}
        className={styles['landmark-canvas']}
        aria-hidden
      />

      {/* 실패 시 중앙 경고 */}
      {isFailed && (
        <div className={styles['error-callout']} role="alert">
          <strong className={styles['error-title']}>
            ⚠ 사용자를 인식할 수 없어요
          </strong>
          <p className={styles['error-desc']}>
            카메라 정면에 상반신이 보이도록 바르게 앉아주세요
          </p>
        </div>
      )}

      {/* 하단 안내 문구 */}
      <p className={styles['guide-caption']}>
        {isFailed
          ? '인식에 실패하면 의자를 뒤로 살짝 빼서 상반신 전체를 보여주세요'
          : '머리와 양 어깨에 선이 그려지면 인식된 것입니다'}
      </p>

      {cameraStatus === 'denied' && (
        <div className={styles['denied-cover']} role="alert">
          카메라 권한이 필요합니다. 브라우저 주소창의 카메라 아이콘에서 허용해
          주세요.
        </div>
      )}
    </div>
  );
}
