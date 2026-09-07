// src/components/study/PostureHighlightLayer.tsx
import type { BodyHighlight } from '@/types/posture-highlight';
import styles from './PostureHighlightLayer.module.css';

interface PostureHighlightLayerProps {
  highlights: BodyHighlight[];
  /** 원본 프레임 비율 (기본 16:9) */
  aspectWidth?: number;
  aspectHeight?: number;
}

export default function PostureHighlightLayer({
  highlights,
  aspectWidth = 16,
  aspectHeight = 9,
}: PostureHighlightLayerProps) {
  if (highlights.length === 0) return null;

  return (
    <svg
      className={styles['highlight-layer']}
      viewBox={`0 0 ${aspectWidth} ${aspectHeight}`}
      /* object-fit: cover 와 동일한 크롭 방식 */
      preserveAspectRatio="xMidYMid slice"
      aria-hidden
    >
      <defs>
        {highlights.map((h) => (
          <radialGradient key={`grad-${h.id}`} id={`grad-${h.id}`}>
            <stop
              offset="0%"
              className={styles['glow-inner']}
              data-severity={h.severity}
            />
            <stop
              offset="70%"
              className={styles['glow-mid']}
              data-severity={h.severity}
            />
            <stop
              offset="100%"
              className={styles['glow-outer']}
              data-severity={h.severity}
            />
          </radialGradient>
        ))}
      </defs>

      {highlights.map((h) => {
        const cx = h.x * aspectWidth;
        const cy = h.y * aspectHeight;
        const r = h.radius * aspectHeight;

        return (
          <g key={h.id} className={styles['highlight-group']}>
            <circle
              cx={cx}
              cy={cy}
              r={r}
              fill={`url(#grad-${h.id})`}
              className={styles['highlight-glow']}
              data-severity={h.severity}
            />
            <circle
              cx={cx}
              cy={cy}
              r={r}
              className={styles['highlight-ring']}
              data-severity={h.severity}
            />
          </g>
        );
      })}
    </svg>
  );
}