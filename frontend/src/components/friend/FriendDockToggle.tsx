// src/components/friend/FriendDockToggle.tsx
import { UsersIcon } from './icons';
import styles from './FriendDockToggle.module.css';

interface FriendDockToggleProps {
  onOpen: () => void;
  /** 받은 친구 신청 건수. 0 이면 배지를 두지 않는다 */
  requestCount: number;
}

/** 배지에 그대로 적기에 너무 큰 수. 이 위는 '9+' 로 줄인다 */
const BADGE_MAX = 9;

/**
 * 접힌 상태의 친구 독 — 화면 우하단 원형 버튼.
 *
 * 받은 신청이 있으면 배지를 띄운다. 접힌 상태에서는 이 버튼이 화면에 남는 유일한 친구 관련
 * 요소라, 여기에 표시가 없으면 신청이 와 있어도 창을 열어 봐야만 알 수 있다.
 *
 * 값은 실시간이 아니다(polling 을 하지 않는다). 화면을 옮길 때와 신청을 처리한 직후에
 * 다시 받는다 — useIncomingRequestCount 참고.
 */
export default function FriendDockToggle({
  onOpen,
  requestCount,
}: FriendDockToggleProps) {
  const hasRequests = requestCount > 0;

  return (
    <button
      type="button"
      onClick={onOpen}
      className={styles['toggle']}
      aria-label={
        hasRequests
          ? `친구 목록 열기 (받은 신청 ${requestCount}건)`
          : '친구 목록 열기'
      }
      title={hasRequests ? `받은 친구 신청 ${requestCount}건` : '친구 목록'}
    >
      <UsersIcon size={24} />

      {hasRequests && (
        <span className={styles['badge']} aria-hidden>
          {requestCount > BADGE_MAX ? `${BADGE_MAX}+` : requestCount}
        </span>
      )}
    </button>
  );
}
