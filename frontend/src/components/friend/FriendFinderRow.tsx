// src/components/friend/FriendFinderRow.tsx
import { FRIEND_ACTION_LABEL, searchRowView } from '@/lib/friend/relationship';
import type { FriendAction } from '@/lib/friend/relationship';
import type { FriendItem } from '@/types/friend';
import styles from './FriendFinderRow.module.css';

interface FriendFinderRowProps {
  item: FriendItem;
  /** 이 사람에 대한 요청이 처리 중인가 */
  busy: boolean;
  onAction: (action: FriendAction, item: FriendItem) => void;
}

/**
 * 친구 찾기 창의 한 줄. 검색 결과와 받은 요청이 같은 컴포넌트를 쓴다.
 *
 * 두 목록의 항목 형태가 서버에서 동일하고(FriendResponse), 무슨 버튼을 그릴지는 관계 상태
 * 하나로 정해진다(searchRowView). 그래서 탭마다 따로 만들 이유가 없다 — 라벨이나 규칙이
 * 바뀌어도 한 곳만 고친다.
 */
export default function FriendFinderRow({
  item,
  busy,
  onAction,
}: FriendFinderRowProps) {
  const { actions, stateLabel } = searchRowView(item.relationshipStatus);

  return (
    <li className={styles['row']}>
      <span className={styles['avatar']}>
        {item.profileImageUrl ? (
          <img src={item.profileImageUrl} alt="" />
        ) : (
          item.nickname.slice(0, 2)
        )}
      </span>
      <span className={styles['name']}>{item.nickname}</span>

      <span className={styles['actions']}>
        {actions.map((action) => (
          <button
            key={action}
            type="button"
            disabled={busy}
            onClick={() => onAction(action, item)}
            className={styles['action-btn']}
            // 수락·신청은 눈에 띄어야 하고, 거절은 실수로 누르면 안 된다.
            data-variant={action === 'reject' ? 'quiet' : 'primary'}
          >
            {FRIEND_ACTION_LABEL[action]}
          </button>
        ))}

        {/* 누를 것이 없는 상태(신청 대기 중·이미 친구)는 문구만 보여준다 */}
        {stateLabel && <span className={styles['state']}>{stateLabel}</span>}
      </span>
    </li>
  );
}
