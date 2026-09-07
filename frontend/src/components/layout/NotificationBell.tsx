// src/components/layout/NotificationBell.tsx
import { useEffect, useRef, useState } from 'react';

import { useNotifications } from '@/hooks/useNotifications';
import { useFriendDockStore } from '@/stores/useFriendDockStore';
import { useIsLoggedIn } from '@/stores/useAuthStore';
import {
  DM_ROOM_REFERENCE_TYPE,
  FRIENDSHIP_REFERENCE_TYPE,
} from '@/types/notification';
import type { NotificationItem } from '@/types/notification';
import { formatListTime } from '@/utils/datetime';
import styles from './NotificationBell.module.css';

/** 배지에 그대로 적기에 너무 큰 수 */
const BADGE_MAX = 9;

function BellIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden>
      <path
        d="M10 2a6 6 0 0 0-6 6v3l-1.5 2.5h15L16 11V8a6 6 0 0 0-6-6zm0 0V1m0 17a2 2 0 0 0 2-2H8a2 2 0 0 0 2 2z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

/**
 * 헤더의 알림 종과 드롭다운.
 *
 * 친구·DM 알림만 이동을 연결한다. 서버가 만드는 알림은 지금 `FRIENDSHIP`·`DM`·`REPORT`
 * 셋인데, 리포트는 이번 범위가 아니라 읽음 처리만 한다 — 목록에서 감추지는 않는다.
 * 알림이 왔는데 목록에 없으면 그게 더 헷갈린다.
 *
 * 배지 값은 실시간이 아니다(polling 을 하지 않는다). 화면을 옮길 때와 종을 열 때 갱신된다.
 */
export default function NotificationBell() {
  const isLoggedIn = useIsLoggedIn();
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement | null>(null);

  const {
    unreadCount,
    items,
    loading,
    error,
    open: load,
    markRead,
    markAllRead,
    clearRead,
  } = useNotifications(isLoggedIn);

  const openFinder = useFriendDockStore((s) => s.openFinder);
  const openDm = useFriendDockStore((s) => s.openDm);

  // 바깥 클릭·Esc 로 닫는다.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent) => {
      if (!wrapperRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  if (!isLoggedIn) return null;

  function handleToggle() {
    if (open) {
      setOpen(false);
      return;
    }
    // 열 때 목록을 받는다. 배지에는 개수만 필요해서 평소에는 목록을 받지 않는다.
    load();
    setOpen(true);
  }

  /**
   * 알림을 눌렀을 때. 읽음 처리하고 가리키는 화면을 연다.
   *
   * 이동 대상은 `referenceType` 으로 정한다 — `FRIENDSHIP` 은 친구 신청 수신(수락 알림은
   * 서버가 만들지 않는다)이라 '받은 요청' 탭으로, `DM` 은 `referenceId` 가 방 번호다.
   */
  function handleSelect(item: NotificationItem) {
    if (item.readAt === null) markRead(item.notificationId);
    setOpen(false);

    if (item.referenceType === FRIENDSHIP_REFERENCE_TYPE) {
      openFinder('requests');
      return;
    }
    if (item.referenceType === DM_ROOM_REFERENCE_TYPE && item.referenceId) {
      // 독은 건드리지 않는다. DM 창은 패널이 펼쳐져 있으면 그만큼 왼쪽으로 비켜서므로
      // 어느 상태에서도 가려지지 않고, 사용자가 열어 둔 패널을 함부로 접을 이유도 없다.
      openDm(item.referenceId);
    }
    // 그 밖의 타입(리포트 등)은 이동 경로가 정해지지 않았다. 읽음 처리만 하고 닫는다.
  }

  return (
    <div className={styles['wrapper']} ref={wrapperRef}>
      <button
        type="button"
        onClick={handleToggle}
        className={styles['bell-btn']}
        aria-label={
          unreadCount > 0 ? `알림 (안 읽음 ${unreadCount}건)` : '알림'
        }
        aria-expanded={open}
      >
        <BellIcon />
        {unreadCount > 0 && (
          <span className={styles['badge']} aria-hidden>
            {unreadCount > BADGE_MAX ? `${BADGE_MAX}+` : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className={styles['dropdown']} role="menu" aria-label="알림 목록">
          <div className={styles['dropdown-head']}>
            <p className={styles['dropdown-title']}>알림</p>
            <div className={styles['bulk-actions']}>
              <button
                type="button"
                className={styles['bulk-btn']}
                disabled={unreadCount === 0}
                onClick={() => void markAllRead()}
              >
                모두 읽음
              </button>
              <button
                type="button"
                className={styles['bulk-btn']}
                // 물리 삭제라 한 번 확인한다. 안 읽은 알림은 서버가 보존하므로
                // 이 동작으로 확인하지 않은 소식이 사라지지는 않는다.
                onClick={() => {
                  if (
                    window.confirm(
                      '읽은 알림을 모두 지울까요? 되돌릴 수 없습니다.',
                    )
                  ) {
                    void clearRead();
                  }
                }}
              >
                읽은 알림 지우기
              </button>
            </div>
          </div>

          {error && (
            <p className={styles['state']} data-tone="error">
              {error}
            </p>
          )}

          {!error && items.length === 0 && (
            <p className={styles['state']}>
              {loading ? '불러오는 중…' : '새로운 알림이 없습니다.'}
            </p>
          )}

          {items.length > 0 && (
            <ul className={styles['list']}>
              {items.map((item) => (
                <li key={item.notificationId}>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => handleSelect(item)}
                    className={styles['item']}
                    data-unread={item.readAt === null}
                  >
                    <span className={styles['item-head']}>
                      <span className={styles['item-title']}>{item.title}</span>
                      <span className={styles['item-time']}>
                        {formatListTime(item.createdAt)}
                      </span>
                    </span>
                    <span className={styles['item-message']}>
                      {item.message}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
