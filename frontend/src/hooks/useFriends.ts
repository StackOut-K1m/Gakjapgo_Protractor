import { useCallback, useEffect, useRef, useState } from 'react';

import { getApiErrorMessage } from '@/api/client';
import { getFriends } from '@/api/friendApi';
import { onUserEvent } from '@/lib/ws/userEvents';
import type { FriendItem } from '@/types/friend';

/**
 * 목록이 낡았다고 볼 시간(ms).
 *
 * 독은 라우트가 바뀌어도 언마운트되지 않으므로, 펼친 채로 오래 두면 목록이 그만큼 낡는다.
 * 탭으로 돌아올 때 이 시간을 넘겼으면 다시 받는다 — 매번 받으면 창을 옮길 때마다 요청이 나가고,
 * 아예 안 받으면 상대가 내 신청을 수락한 것을 영영 모른다.
 */
const STALE_AFTER_MS = 120_000;

/**
 * 내 친구 목록.
 *
 * <b>polling 하지 않는다.</b> 프레즌스(접속 여부)를 쓰지 않기로 해서 초 단위로 맞출 값이 없고,
 * 관계 변화는 아래 시점에 따라잡는다.
 *
 *   1) 독을 펼칠 때 (`active` 가 true 로 바뀔 때)
 *   2) 신청·수락·거절·삭제 성공 직후 (`refresh` 를 호출부가 부른다)
 *   3) 친구 알림을 눌렀을 때 (같은 `refresh`)
 *   4) 탭으로 돌아왔고 마지막 조회가 STALE_AFTER_MS 를 넘겼을 때
 *   5) 패널 헤더의 새로고침 버튼
 *
 * 한 번에 100명(서버 최대)까지 받는다. 패널 검색창이 서버를 부르지 않는 로컬 필터라서,
 * 페이지를 나눠 받으면 "검색했는데 다음 페이지의 친구가 안 나오는" 상태가 된다.
 * 100명을 넘는 경우만 `loadMore` 로 이어 받는다.
 */
export function useFriends(active: boolean) {
  const [friends, setFriends] = useState<FriendItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** 다음에 받을 페이지. null 이면 더 없다 */
  const [nextPage, setNextPage] = useState<number | null>(null);

  const fetchedAt = useRef(0);
  /** 언마운트·비활성 뒤에 도착한 응답이 상태를 덮지 않게 한다 */
  const requestSeq = useRef(0);

  const load = useCallback(async (page: number) => {
    const seq = ++requestSeq.current;
    setLoading(true);
    setError(null);
    try {
      const data = await getFriends(page);
      if (seq !== requestSeq.current) return;
      setFriends((prev) =>
        page === 0 ? data.friends : [...prev, ...data.friends],
      );
      setNextPage(
        data.page.page + 1 < data.page.totalPages ? data.page.page + 1 : null,
      );
      fetchedAt.current = Date.now();
    } catch (e) {
      if (seq !== requestSeq.current) return;
      setError(getApiErrorMessage(e, '친구 목록을 불러오지 못했습니다.'));
    } finally {
      if (seq === requestSeq.current) setLoading(false);
    }
  }, []);

  /** 처음부터 다시 받는다. 관계를 바꾼 뒤 호출부가 부른다. */
  const refresh = useCallback(() => {
    void load(0);
  }, [load]);

  const loadMore = useCallback(() => {
    if (nextPage !== null && !loading) void load(nextPage);
  }, [nextPage, loading, load]);

  // 펼칠 때 한 번 받는다. 접었다 곧바로 다시 펼치는 경우까지 매번 받지는 않는다.
  useEffect(() => {
    if (!active) return;
    if (Date.now() - fetchedAt.current < STALE_AFTER_MS && friends.length > 0) {
      return;
    }
    void load(0);
    // friends 는 조건 판단에만 쓴다 — 의존성에 넣으면 목록이 바뀔 때마다 다시 받는다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, load]);

  // 다른 창을 보다 돌아왔을 때. 펼쳐 둔 채로 오래 지난 경우만 다시 받는다.
  useEffect(() => {
    if (!active) return;
    const handleVisibility = () => {
      if (document.visibilityState !== 'visible') return;
      if (Date.now() - fetchedAt.current < STALE_AFTER_MS) return;
      void load(0);
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () =>
      document.removeEventListener('visibilitychange', handleVisibility);
  }, [active, load]);

  // 실시간 수신·재연결. 상대가 내 신청을 수락하면 그 즉시 목록에 나타난다 —
  // 지금은 독을 접었다 펼쳐야 보인다.
  useEffect(() => {
    if (!active) return;
    const offFriendship = onUserEvent('friendship', () => void load(0));
    const offReconnect = onUserEvent('connected', () => void load(0));
    return () => {
      offFriendship();
      offReconnect();
    };
  }, [active, load]);

  /**
   * 서버를 부르지 않고 목록에서 한 명을 빼낸다. 삭제 직후 화면을 먼저 맞추는 데 쓴다.
   * (되돌릴 일이 거의 없고 즉각성이 중요한 유일한 동작이라 삭제에만 쓴다)
   */
  const removeLocally = useCallback((memberId: number) => {
    setFriends((prev) => prev.filter((f) => f.memberId !== memberId));
  }, []);

  return {
    friends,
    loading,
    error,
    refresh,
    loadMore,
    hasMore: nextPage !== null,
    removeLocally,
  };
}
