// src/components/friend/FriendListItem.tsx
import type { ReactElement } from 'react';

import {
  FRIEND_ACTION_LABEL,
  FRIEND_MENU_ACTIONS,
} from '@/lib/friend/relationship';
import type { FriendAction } from '@/lib/friend/relationship';
import type { FriendItem } from '@/types/friend';
import { formatListTime } from '@/utils/datetime';
import { MessageCircleIcon, UserCheckIcon, UserMinusIcon } from './icons';
import styles from './FriendListItem.module.css';

interface FriendListItemProps {
  friend: FriendItem;
  /** 액션 패널을 펼쳐 둔 항목인가 */
  selected: boolean;
  /** 이 친구에 대한 요청이 처리 중인가 — 버튼을 잠근다 */
  busy: boolean;
  /** 이 친구와의 마지막 대화. 없으면 줄을 비운다 */
  lastMessage?: string | null;
  lastMessageAt?: string | null;
  /** 안 본 대화가 있는가. 개수는 서버가 주지 않아 점만 찍는다(useDmSummaries 참고) */
  hasUnread?: boolean;
  onToggle: () => void;
  onAction: (action: FriendAction) => void;
}

/** 메뉴 항목 아이콘. 이 목록은 ACCEPTED 만 담으므로 세 가지만 쓴다. */
const ACTION_ICON: Partial<Record<FriendAction, ReactElement>> = {
  profile: <UserCheckIcon size={14} />,
  dm: <MessageCircleIcon size={14} />,
  remove: <UserMinusIcon size={14} />,
};

/**
 * 친구 목록의 한 줄. 누르면 <b>그 아래로 액션 패널이 펼쳐진다</b>(목록을 밀어낸다).
 *
 * 떠 있는 팝오버로 만들지 않은 이유는 와이어프레임이 그렇게 잡혀 있고, 실제로 그 편이 단순하다.
 * 팝오버는 화면 좌표를 재서 붙이고 스크롤·리사이즈마다 다시 계산해야 한다
 * (스터디룸 ParticipantMenu 가 그 방식이다). 여기서는 목록이 밀리면서 자리를 만든다.
 */
export default function FriendListItem({
  friend,
  selected,
  busy,
  lastMessage,
  lastMessageAt,
  hasUnread = false,
  onToggle,
  onAction,
}: FriendListItemProps) {
  return (
    <li className={styles['row']}>
      <button
        type="button"
        onClick={onToggle}
        className={styles['item']}
        data-selected={selected}
        aria-expanded={selected}
      >
        <span className={styles['avatar']}>
          {friend.profileImageUrl ? (
            <img src={friend.profileImageUrl} alt="" />
          ) : (
            // 사진이 없으면 닉네임 앞 두 글자. 헤더의 내 아바타와 같은 규칙이다.
            friend.nickname.slice(0, 2)
          )}
        </span>
        {/* 이름 아래에 마지막 대화를 한 줄 곁들인다. 와이어프레임의 상태 문구 자리인데,
            접속 상태를 알 수 없어 비어 있던 칸이다 — 대화가 그 자리를 채운다. */}
        <span className={styles['details']}>
          <span className={styles['name']}>{friend.nickname}</span>
          {lastMessage && (
            <span className={styles['preview']} data-unread={hasUnread}>
              {lastMessage}
            </span>
          )}
        </span>

        <span className={styles['meta']}>
          {lastMessageAt && (
            <span className={styles['time']}>
              {formatListTime(lastMessageAt)}
            </span>
          )}
          {/* 안 본 대화 표시. 개수가 아니라 점인 이유는 서버가 개수를 주지 않기 때문이다 */}
          {hasUnread && (
            <span
              className={styles['unread-dot']}
              aria-label="안 읽은 메시지"
            />
          )}
        </span>
      </button>

      {selected && (
        <div className={styles['action-wrap']}>
          <div className={styles['action-panel']} role="menu">
            {FRIEND_MENU_ACTIONS.map((action) => (
              <button
                key={action}
                type="button"
                role="menuitem"
                disabled={busy}
                onClick={() => onAction(action)}
                className={styles['action-item']}
                data-variant={action === 'remove' ? 'danger' : undefined}
              >
                <span className={styles['action-icon']}>
                  {ACTION_ICON[action]}
                </span>
                {FRIEND_ACTION_LABEL[action]}
              </button>
            ))}
          </div>
        </div>
      )}
    </li>
  );
}
