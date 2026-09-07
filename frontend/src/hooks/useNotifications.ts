import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';

import { getApiErrorMessage } from '@/api/client';
import {
  deleteReadNotifications,
  getNotifications,
  getUnreadNotificationCount,
  markAllNotificationsRead,
  readNotification,
} from '@/api/notificationApi';
import { onUserEvent } from '@/lib/ws/userEvents';
import type { NotificationItem } from '@/types/notification';

/**
 * 인앱 알림 — 미읽음 개수와 목록.
 *
 * <b>polling 하지 않는다.</b> 대신 마운트·라우트 변경·드롭다운을 열 때 다시 받는다. 화면을
 * 옮기는 것이 사용자가 자연히 만드는 갱신 기회라, 가만히 있는 동안 새 알림이 즉시 뜨지는
 * 않지만 요청도 늘지 않는다. 실시간이 필요해지면 WebSocket 구독에서 `refreshCount` 만
 * 부르면 된다.
 *
 * 목록은 <b>열 때만</b> 받는다. 배지에는 개수(size=1)만 필요해서, 열지도 않은 목록을
 * 미리 받아 둘 이유가 없다.
 */
export function useNotifications(enabled: boolean) {
  const { pathname } = useLocation();
  const [unreadCount, setUnreadCount] = useState(0);
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const countSeq = useRef(0);
  const listSeq = useRef(0);

  const refreshCount = useCallback(async () => {
    const seq = ++countSeq.current;
    try {
      const count = await getUnreadNotificationCount();
      if (seq === countSeq.current) setUnreadCount(count);
    } catch {
      // 배지는 보조 정보다. 다음 갱신 기회에 다시 시도한다.
    }
  }, []);

  const loadList = useCallback(async () => {
    const seq = ++listSeq.current;
    try {
      const data = await getNotifications();
      if (seq !== listSeq.current) return;
      setItems(data.notifications);
      setError(null);
    } catch (e) {
      if (seq !== listSeq.current) return;
      setError(getApiErrorMessage(e, '알림을 불러오지 못했습니다.'));
    } finally {
      if (seq === listSeq.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    // 이 규칙은 await 경계를 보지 않는다. 상태 변경은 모두 응답 뒤에 일어난다.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refreshCount();
    // pathname 이 의존성에 있는 것은 의도적이다 — 화면을 옮길 때마다 개수를 새로 받는다.
  }, [enabled, refreshCount, pathname]);

  /**
   * 실시간 수신·재연결. 알림이 생기면 배지를 곧바로 올린다.
   *
   * 목록까지 받지는 않는다 — 닫혀 있는 드롭다운의 내용은 필요하지 않고, 열 때 어차피 받는다.
   */
  useEffect(() => {
    if (!enabled) return;
    const offNotification = onUserEvent(
      'notification',
      () => void refreshCount(),
    );
    const offReconnect = onUserEvent('connected', () => void refreshCount());
    return () => {
      offNotification();
      offReconnect();
    };
  }, [enabled, refreshCount]);

  /** 드롭다운을 열 때 부른다. 목록과 개수를 함께 맞춘다. */
  const open = useCallback(() => {
    setLoading(true);
    void loadList();
    void refreshCount();
  }, [loadList, refreshCount]);

  /**
   * 읽음 처리. 화면에서 먼저 표시를 지우고 배지도 줄인다 — 눌렀는데 그대로면 안 눌린 것처럼 보인다.
   * 실패는 삼킨다. 다음 갱신에서 서버 값으로 되돌아온다.
   */
  const markRead = useCallback((notificationId: number) => {
    setItems((prev) =>
      prev.map((item) =>
        item.notificationId === notificationId && item.readAt === null
          ? { ...item, readAt: new Date().toISOString() }
          : item,
      ),
    );
    setUnreadCount((prev) => Math.max(0, prev - 1));
    void readNotification(notificationId).catch(() => {});
  }, []);

  /**
   * 일괄 동작(모두 읽음·읽은 알림 삭제).
   *
   * 두 API 모두 204 라 돌려받는 것이 없다. 그래서 성공 뒤 목록과 개수를 다시 받는다 —
   * 화면에서 계산해 맞추면 서버가 실제로 무엇을 바꿨는지와 어긋날 수 있다.
   */
  const runBulk = useCallback(
    async (task: () => Promise<void>, fallback: string) => {
      setLoading(true);
      try {
        await task();
        setError(null);
      } catch (e) {
        setError(getApiErrorMessage(e, fallback));
      }
      void loadList();
      void refreshCount();
    },
    [loadList, refreshCount],
  );

  const markAllRead = useCallback(
    () => runBulk(markAllNotificationsRead, '모두 읽음 처리에 실패했습니다.'),
    [runBulk],
  );

  /** 읽은 알림 삭제. 물리 삭제라 호출부에서 확인을 받은 뒤 부른다. */
  const clearRead = useCallback(
    () => runBulk(deleteReadNotifications, '알림을 지우지 못했습니다.'),
    [runBulk],
  );

  return {
    unreadCount,
    items,
    loading,
    error,
    open,
    markRead,
    markAllRead,
    clearRead,
    refreshCount,
  };
}
