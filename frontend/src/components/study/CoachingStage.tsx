// src/components/study/CoachingStage.tsx
import type { ReactNode } from 'react';

import { COACHING_MODES } from '@/types/coaching';
import type { CoachingState } from '@/types/coaching';
import { maxSeverity } from '@/types/posture-highlight';
import type { BodyHighlight } from '@/types/posture-highlight';
import type { CanvasRefCallback, VideoRefCallback } from '@/types/video';
import PostureRecoveryCountdown from './PostureRecoveryCountdown';
import SelfVideo from './SelfVideo';
import { WarningIcon } from './icons';
import styles from './CoachingStage.module.css';

interface CoachingStageProps {
  attachVideo: VideoRefCallback;
  /** 배경 효과 캔버스. null 이면 효과가 꺼져 있다 */
  attachEffectCanvas?: CanvasRefCallback | null;
  userName: string;
  cameraOn: boolean;
  coaching: CoachingState;
  /** 경고가 하나라도 있으면 true — 색상 오버레이 활성화 */
  active: boolean;
  /**
   * 신체 부위별 강조. 오른쪽 위 범례와 테두리·토스트 색만 이 값을 쓴다 —
   * 영상 위에 직접 칠하지는 않는다.
   */
  highlights?: BodyHighlight[];
  /**
   * 영상 위에 얹을 것(실시간 자세 신호등 등).
   *
   * 바깥에서 스테이지에 얹지 않고 여기로 받는 이유는 그리드 화면과 위치를 맞추기 위해서다.
   * 두 화면 모두 '영상 타일 왼쪽 위 모서리' 기준이 된다.
   */
  overlay?: ReactNode;
  /**
   * 경고가 모두 풀릴 것으로 보이는 시각(ms). null 이면 회복 중이 아니다.
   * 이 화면이 언제 닫히는지를 남은 시간으로 보여주는 데 쓴다.
   */
  recoveryEndsAt?: number | null;
  /**
   * 영상 아래 안내 문구를 대신할 값. 없으면 코칭 모드의 기본 문구를 쓴다.
   *
   * 자세 경고는 해제 조건이 무엇이 떠 있느냐에 따라 달라서(서버 자세 2초 / 턱 괴기 1초)
   * 모드별 고정 문구로는 맞출 수 없다. 그 사정을 아는 쪽이 만들어 넘긴다.
   */
  caption?: string | null;
}

export default function CoachingStage({
  attachVideo,
  attachEffectCanvas,
  userName,
  cameraOn,
  coaching,
  active,
  highlights = [],
  overlay,
  recoveryEndsAt = null,
  caption = null,
}: CoachingStageProps) {
  const config = COACHING_MODES[coaching.mode];
  const primaryId = coaching.warningIds[0];
  const primary = config.checks.find((c) => c.id === primaryId);
  const isCameraOff = coaching.mode === 'camera-off';

  const visibleHighlights = cameraOn ? highlights : [];
  const severity = maxSeverity(visibleHighlights);

  return (
    <div className={styles['coaching-stage']}>
      <div
        className={styles['stage-tile']}
        data-active={active}
        data-mode={coaching.mode}
        data-severity={severity ?? undefined}
      >
        <SelfVideo
          attachVideo={attachVideo}
          attachEffectCanvas={attachEffectCanvas}
          className={styles['stage-video']}
        />

        {/* 몸 위에 부위별로 색을 칠하던 레이어(PostureSilhouetteLayer)를 걷어냈다.
            오른쪽 위 범례가 이미 어느 부위가 어느 정도인지 색으로 알려 주고 있어서,
            영상 위에 한 번 더 칠하면 정작 자세를 확인해야 할 화면만 가린다. */}
        {overlay}

        {isCameraOff && (
          <div className={styles['camera-off-cover']}>
            <span className={styles['camera-off-icon']} aria-hidden>
              📷
            </span>
            <p className={styles['camera-off-hint']}>
              하단의 &apos;비디오 켜기&apos; 버튼을 눌러 자세 분석과 학습 시간
              기록을 활성화해주세요.
            </p>
          </div>
        )}

        {/*
          카메라를 껐을 때는 경고 토스트를 띄우지 않는다. 바로 위 안내판이 이미 같은 말을
          하고 있어서, 빨간 토스트까지 겹치면 한 화면에서 같은 사실을 두 번 읽게 된다.
          게다가 이건 사용자가 직접 끈 것이라 '경고'로 다룰 일이 아니다.
        */}
        {primary && !isCameraOff && (
          <p
            className={styles['stage-toast']}
            data-mode={coaching.mode}
            data-severity={severity ?? undefined}
            role="alert"
          >
            <WarningIcon />
            {primary.toast}
          </p>
        )}

        {visibleHighlights.length > 0 && (
          <ul className={styles['severity-legend']}>
            {visibleHighlights.map((h) => (
              <li
                key={h.id}
                className={styles['legend-item']}
                data-severity={h.severity}
              >
                <span className={styles['legend-dot']} aria-hidden />
                {h.label}
              </li>
            ))}
          </ul>
        )}

        {/* 평소에는 "바른 자세를 2초간 유지하면 …" 안내를, 실제로 자세를 고치는 동안에는
            같은 자리에서 남은 시간을 센다. 문구를 따로 띄우지 않는 이유는 이미 같은 말을
            하고 있는 줄이 여기 있어서다 — 두 개를 나란히 두면 어느 쪽을 봐야 할지 헷갈린다. */}
        {/* 카메라를 껐을 때는 이 줄도 띄우지 않는다. 위 안내판의 문구가 무엇을 눌러야
            하는지까지 말해 주고 있어서, 여기에 한 줄을 더 붙이면 같은 내용을 세 번째로
            읽히는 셈이 된다. */}
        {isCameraOff ? null : recoveryEndsAt !== null ? (
          <PostureRecoveryCountdown
            className={styles['stage-caption']}
            endsAt={recoveryEndsAt}
          />
        ) : (
          <p className={styles['stage-caption']}>{caption ?? config.caption}</p>
        )}

        <span className={styles['stage-name']}>
          {userName}
          <span className={styles['stage-name-sub']}>
            (나 - {cameraOn ? config.chipLabel : '카메라 꺼짐'})
          </span>
        </span>

        <span className={styles['stage-counter']}>
          {coaching.elapsedSeconds}
        </span>
      </div>
    </div>
  );
}
