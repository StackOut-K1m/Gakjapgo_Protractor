// src/components/friend/FriendRequestsTab.tsx
import type { FriendAction } from '@/lib/friend/relationship';
import type { FriendItem } from '@/types/friend';
import FriendFinderRow from './FriendFinderRow';
import styles from './FriendFinderModal.module.css';

interface FriendRequestsTabProps {
  requests: FriendItem[];
  loading: boolean;
  error: string | null;
  busyMemberId: number | null;
  onAction: (action: FriendAction, item: FriendItem) => void;
}

/**
 * 받은 친구 신청 탭.
 *
 * 목록·재조회는 부모(모달)가 들고 있다 — 탭 제목의 건수 배지가 같은 값을 써야 하고,
 * 수락·거절 뒤 재조회도 부모가 함께 처리한다.
 */
export default function FriendRequestsTab({
  requests,
  loading,
  error,
  busyMemberId,
  onAction,
}: FriendRequestsTabProps) {
  if (error) {
    return (
      <p className={styles['state']} data-tone="error" role="alert">
        {error}
      </p>
    );
  }

  if (requests.length === 0) {
    return (
      <p className={styles['state']}>
        {loading ? '받은 신청을 불러오는 중…' : '받은 친구 신청이 없습니다.'}
      </p>
    );
  }

  return (
    <ul className={styles['list']}>
      {requests.map((item) => (
        <FriendFinderRow
          key={item.memberId}
          item={item}
          busy={busyMemberId === item.memberId}
          onAction={onAction}
        />
      ))}
    </ul>
  );
}
