// src/components/study/PostureStatusBadge.tsx
import type { PostureBlockedReason } from '../../hooks/usePostureDetection';
import type { DetectionStatus } from '../../types/posture';
import styles from './PostureStatusBadge.module.css';

interface PostureStatusBadgeProps {
  status: DetectionStatus;
  elapsedSeconds: number;
  /** 통과를 막고 있는 것. null 이면 곧 통과한다 */
  blockedReason: PostureBlockedReason | null;
}

/**
 * 무엇을 고쳐야 버튼이 켜지는지.
 *
 * 예전에는 사람을 찾는 중인 것과 자세가 안 맞아 막힌 것이 "자세 확인 중"이라는 한 문구였다.
 * 후자는 고치지 않으면 영영 안 켜지는데 문구는 기다리면 될 것처럼 읽혀서, 사용자가 가만히
 * 기다리다 재시도만 누르게 됐다. 할 행동이 다르면 문구도 달라야 한다.
 */
const BLOCKED_MESSAGE: Record<PostureBlockedReason, string> = {
  NO_PERSON: '얼굴과 양 어깨가 모두 화면에 들어오게 앉아주세요',
  HEAD_DOWN: '고개를 들어 화면을 바라보세요',
  HEAD_TILTED: '고개가 옆으로 기울었습니다 — 머리를 곧게 세워주세요',
  SHOULDER_TILTED: '어깨가 기울었습니다 — 양쪽 높이를 맞춰 앉아주세요',
  FORWARD_HEAD: '목이 앞으로 나왔습니다 — 턱을 당기고 귀와 어깨를 맞춰주세요',
  SHOULDER_UNEVEN:
    '어깨 높이가 맞지 않습니다 — 양쪽 어깨를 같은 높이로 펴주세요',
};

/**
 * 자세 자체가 막고 있는 사유. 여기 속하면 왜 지금 고쳐야 하는지를 한 줄 더 붙인다.
 *
 * NO_PERSON 은 뺀다 — 그건 자세 문제가 아니라 화면에 안 들어온 것이라, 기준선 이야기를
 * 꺼내면 엉뚱한 걱정을 하게 된다.
 */
const POSTURE_REASONS: PostureBlockedReason[] = [
  'HEAD_DOWN',
  'HEAD_TILTED',
  'SHOULDER_TILTED',
  'FORWARD_HEAD',
  'SHOULDER_UNEVEN',
];

/**
 * 지금 자세를 고쳐야 하는 이유.
 *
 * 사용자 입장에서는 "지금 잠깐 자세가 나쁜 게 뭐가 문제냐"가 자연스러운 반응이다. 그런데
 * 여기서 등록하는 자세는 <b>이번 세션 내내 쓰이는 기준선</b>이라, 거북목인 채로 등록하면
 * 그 거북목이 정상이 되어 스터디방에서 한 번도 경고가 뜨지 않는다. 고치라는 말만으로는
 * 그 사정이 전달되지 않아 한 줄을 따로 둔다.
 */
const CALIBRATION_CONTEXT =
  '지금 자세가 이번 세션의 기준이 됩니다. 여기서 바르게 인식돼야 스터디방에서도 자세 판정이 제대로 동작합니다.';

function ClockIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
      <circle cx="8" cy="8" r="6.3" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M8 4.5V8l2.5 1.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M3 8.5l3.5 3.5L13 5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function describe(
  status: DetectionStatus,
  elapsedSeconds: number,
  blockedReason: PostureBlockedReason | null,
): string {
  if (status === 'verified') return '자세가 올바르게 인식되었습니다';
  if (status === 'not-found') {
    return `사용자가 인식되지 않습니다 (${elapsedSeconds}초째 감지 실패)`;
  }
  // 사람은 잡혔다. 막힌 이유가 있으면 그것부터 알린다.
  return blockedReason === null
    ? '자세 확인 중... 그대로 유지해주세요'
    : BLOCKED_MESSAGE[blockedReason];
}

export default function PostureStatusBadge({
  status,
  elapsedSeconds,
  blockedReason,
}: PostureStatusBadgeProps) {
  // 자세 때문에 막혔을 때만 사정을 덧붙인다. 사람을 못 찾은 것과는 할 일이 다르다.
  const showContext =
    blockedReason !== null && POSTURE_REASONS.includes(blockedReason);

  return (
    <div className={styles['status-area']}>
      <p
        className={styles['status-badge']}
        data-status={status}
        // 막힌 이유가 있으면 기다리는 중과 다르게 보여야 한다. 색은 CSS 가 정한다.
        data-blocked={blockedReason !== null}
        role="status"
      >
        {status === 'verified' ? <CheckIcon /> : <ClockIcon />}
        {describe(status, elapsedSeconds, blockedReason)}
      </p>

      {showContext && (
        <p className={styles['status-context']}>{CALIBRATION_CONTEXT}</p>
      )}
    </div>
  );
}
