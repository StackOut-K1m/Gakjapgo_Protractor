// src/components/study/CoachingStatusBar.tsx
import { COACHING_MODES } from '@/types/coaching';
import type { CoachingState } from '@/types/coaching';
import { CheckCircleIcon, DisabledCircleIcon, WarningIcon } from './icons';
import styles from './CoachingStatusBar.module.css';

interface CoachingStatusBarProps {
  coaching: CoachingState;
}

export default function CoachingStatusBar({
  coaching,
}: CoachingStatusBarProps) {
  const config = COACHING_MODES[coaching.mode];

  // 개별 항목을 판단할 수 없는 상황이면 상황 라벨 자체가 경고다
  const labelIsCause = config.checks.every(
    (check) => coaching.checks[check.id] === 'paused',
  );

  return (
    <div className={styles['status-bar']} role="status">
      <span className={styles['status-label']} data-cause={labelIsCause}>
        {config.barLabel}
      </span>

      <ul className={styles['status-list']}>
        {config.checks.map((check) => {
          const state = coaching.checks[check.id] ?? 'ok';
          const label =
            state === 'warning'
              ? check.warningLabel
              : state === 'paused'
                ? check.pausedLabel
                : check.okLabel;

          return (
            <li
              key={check.id}
              className={styles['status-item']}
              data-state={state}
            >
              {state === 'warning' ? (
                <WarningIcon />
              ) : state === 'paused' ? (
                <DisabledCircleIcon />
              ) : (
                <CheckCircleIcon />
              )}
              {label}
            </li>
          );
        })}
      </ul>
    </div>
  );
}