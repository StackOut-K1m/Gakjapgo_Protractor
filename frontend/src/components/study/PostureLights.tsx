// src/components/study/PostureLights.tsx
//
// 서버가 1초마다 돌려주는 판정을 신호등으로 보여준다.
//
// 경고 카운트는 관찰 구간을 채워야 오르기 때문에, 카운트만 보면 그동안 화면에서는
// 아무 일도 일어나지 않는 것처럼 보인다. 지금 자세가 어떻게 읽히고 있는지, 확정까지
// 얼마나 남았는지를 그 사이에 보여주는 게 이 패널의 역할이다.
import {
  POSTURE_TYPES,
  POSTURE_TYPE_LABEL,
  SKIP_REASON_LABEL,
  toPostureLight,
} from '@/types/posture';
import { CHIN_REST_HOLD_SECONDS } from '@/hooks/useChinRestDetection';
import type { ChinRestBlockedReason } from '@/lib/pose/chinRest';
import type {
  PostureFrameResponse,
  PostureJudgement,
  PostureLight,
  PostureType,
} from '@/types/posture';
import styles from './PostureLights.module.css';

interface PostureLightsProps {
  /** 마지막 판정 응답. null 이면 아직 첫 응답 전이다 */
  response: PostureFrameResponse | null;
  /** 자세별 현재 나쁜 자세 지속 시간(초) */
  badSeconds: Partial<Record<PostureType, number>>;
  /** 이 시간(초)을 채우면 서버가 경고 1회로 확정한다 */
  windowSeconds: number;
  /** 판정이 멈춘 이유. null 이면 정상 동작 중 */
  pausedReason: string | null;
  /**
   * 턱 괴기 상태. 서버 판정이 아니라 브라우저가 직접 낸 값이라 응답과 섞이지 않게 따로 받는다.
   * 없으면 줄 자체를 그리지 않는다.
   */
  chinRest?: {
    active: boolean;
    holding: boolean;
    holdingSeconds: number;
    blockedReason: ChinRestBlockedReason | null;
  };
}

/**
 * 신호등 옆에 붙는 한 줄 상태 문구.
 *
 * 심각도 숫자는 그대로 보여주지 않는다. 사용자가 할 행동은 어느 단계든 "고쳐 앉기"로
 * 같아서, 정상 / 주의 / 경고 세 가지만 구분한다.
 */
function describe(
  judgement: PostureJudgement,
  light: PostureLight,
  seconds: number | undefined,
  windowSeconds: number,
): string {
  if (light === 'paused') {
    return judgement.skipReason
      ? (SKIP_REASON_LABEL[judgement.skipReason] ?? judgement.skipReason)
      : '판정 보류';
  }
  if (light === 'ok') return '정상';
  if (light === 'caution') return '주의';
  // 빨간불이면 확정까지 남은 시간이 곧 사용자가 알아야 할 정보다
  if (seconds !== undefined) {
    return `경고 ${Math.min(seconds, windowSeconds)}/${windowSeconds}초`;
  }
  return '경고';
}

/**
 * 판정을 못 돌리는 이유별 문구.
 *
 * HAND_HIDDEN 은 여기 없다. 손이 화면 밖에 있는 것은 판정이 막힌 상태가 아니라
 * <b>턱을 괴지 않은 상태</b>다 — 키보드에 손을 올려두면 늘 그러므로, 회색으로 두면
 * 대부분의 시간 동안 고장난 것처럼 보인다. 아래에서 '정상'으로 처리한다.
 */
const CHIN_REST_BLOCKED_LABEL: Record<
  Exclude<ChinRestBlockedReason, 'HAND_HIDDEN'>,
  string
> = {
  NO_POSE: '자세를 못 읽음',
  FACE_HIDDEN: '얼굴·어깨 가림',
};

/**
 * 턱 괴기 한 줄.
 *
 * 색 규칙을 서버 판정 3종과 맞춘다. 그쪽은 <b>지금 이 순간</b>의 심각도로 색을 정하고
 * (severity 4 이상이면 곧장 빨강), 지속 판정은 이벤트·경고 배너 쪽 일이다. 턱 괴기도
 * 괴고 있는 프레임이면 바로 빨강이다 — 이 자세는 심각도 단계가 없고 서버로도 4로 보낸다.
 *
 * 예전에는 확정 시간을 채우기 전까지 노랑이었는데, 그러면 빨강이 뜨는 시점이 경고 배너가
 * 뜨는 시점과 같아져서 다른 지표와 규칙이 달라 보였다. 남은 시간은 색이 아니라 문구로 알린다.
 */
function chinRestRow(chinRest: NonNullable<PostureLightsProps['chinRest']>): {
  light: PostureLight;
  state: string;
} {
  if (chinRest.active || chinRest.holding) {
    const elapsed = Math.min(chinRest.holdingSeconds, CHIN_REST_HOLD_SECONDS);
    return {
      light: 'danger',
      state: `경고 ${elapsed}/${CHIN_REST_HOLD_SECONDS}초`,
    };
  }
  if (
    chinRest.blockedReason !== null &&
    chinRest.blockedReason !== 'HAND_HIDDEN'
  ) {
    return {
      light: 'paused',
      state: CHIN_REST_BLOCKED_LABEL[chinRest.blockedReason],
    };
  }
  return { light: 'ok', state: '정상' };
}

export default function PostureLights({
  response,
  badSeconds,
  windowSeconds,
  pausedReason,
  chinRest,
}: PostureLightsProps) {
  if (pausedReason) {
    return (
      <div className={styles['posture-lights']}>
        <span className={styles['title']}>실시간 자세 감지</span>
        <p className={styles['notice']}>중지 — {pausedReason}</p>
      </div>
    );
  }

  if (!response) {
    return (
      <div className={styles['posture-lights']}>
        <span className={styles['title']}>실시간 자세 감지</span>
        <p className={styles['notice']}>첫 판정을 기다리는 중…</p>
      </div>
    );
  }

  // 서버가 3종을 모두 내려주지만, 못 받은 항목은 보류로 그린다
  const byType = new Map(response.judgements.map((j) => [j.type, j]));

  return (
    <div className={styles['posture-lights']}>
      <span className={styles['title']}>실시간 자세 감지</span>
      <ul className={styles['list']}>
        {POSTURE_TYPES.map((type) => {
          const judgement = byType.get(type);
          const light = judgement ? toPostureLight(judgement) : 'paused';
          return (
            <li key={type} className={styles['item']} data-light={light}>
              <span className={styles['dot']} aria-hidden />
              <span className={styles['label']}>
                {POSTURE_TYPE_LABEL[type]}
              </span>
              <span className={styles['state']}>
                {judgement
                  ? describe(judgement, light, badSeconds[type], windowSeconds)
                  : '판정 없음'}
              </span>
            </li>
          );
        })}

        {chinRest &&
          (() => {
            const { light, state } = chinRestRow(chinRest);
            return (
              <li className={styles['item']} data-light={light}>
                <span className={styles['dot']} aria-hidden />
                <span className={styles['label']}>턱 괴기</span>
                <span className={styles['state']}>{state}</span>
              </li>
            );
          })()}
      </ul>
    </div>
  );
}
