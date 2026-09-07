// src/components/study/CoachingHeaderBadge.tsx
import type { TargetPart } from '@/types/stretching';
import { DETECT_PART_LABEL, DETECT_PART_ORDER } from '@/types/stretching';
import { WarningIcon } from './icons';
import styles from './CoachingHeaderBadge.module.css';

interface CoachingHeaderBadgeProps {
  /**
   * 부위별 자세 경고 누적 횟수.
   *
   * 합계가 아니라 부위별로 보여준다 — 스트레칭 강제 진입은 <b>한 부위가</b> 임계치에
   * 닿을 때 일어나므로, 합계 "2/5회"는 턱 괴기 2회 + 거북목 3회처럼 아무 부위도
   * 임계치 근처가 아닌데 곧 진입할 것처럼 읽힌다.
   */
  detectCounts: Record<TargetPart, number>;
  maxWarningCount: number;
  /** 카메라가 꺼져 있으면 경고 횟수 대신 경과 시간을 보여준다 */
  cameraOff: boolean;
  cameraOffSeconds: number;
  /** 이 시간을 넘기면 자리비움 처리 (초) */
  awayThresholdSeconds: number;
}

function formatElapsed(seconds: number) {
  if (seconds < 60) return `${seconds}초`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return s === 0 ? `${m}분` : `${m}분 ${s}초`;
}

export default function CoachingHeaderBadge({
  detectCounts,
  maxWarningCount,
  cameraOff,
  cameraOffSeconds,
  awayThresholdSeconds,
}: CoachingHeaderBadgeProps) {
  if (cameraOff) {
    return (
      <p className={styles['header-badge']} data-active role="alert">
        <WarningIcon />
        카메라 꺼짐 {formatElapsed(cameraOffSeconds)} 경과 (
        {formatElapsed(awayThresholdSeconds)} 초과 시 자리비움 처리)
      </p>
    );
  }

  const anyWarning = DETECT_PART_ORDER.some((p) => detectCounts[p] > 0);

  return (
    <p
      className={styles['header-badge']}
      data-active={anyWarning}
      role="status"
    >
      <WarningIcon />
      나의 자세 경고:
      {DETECT_PART_ORDER.map((part) => (
        <span
          key={part}
          className={styles['part-count']}
          data-hit={detectCounts[part] > 0}
        >
          {DETECT_PART_LABEL[part]}{' '}
          {Math.min(detectCounts[part], maxWarningCount)}/{maxWarningCount}
        </span>
      ))}
      ({maxWarningCount}회 도달 시 스트레칭 모드 강제 진입)
    </p>
  );
}
