import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';

import { getIncomingRequests } from '@/api/friendApi';
import { onUserEvent } from '@/lib/ws/userEvents';

/**
 * 받은 친구 신청 건수. 친구 독 배지에 쓴다.
 *
 * 목록 대신 `size=1` 로 받아 `page.totalElements` 만 읽는다 — 개수 전용 API 는 없고,
 * 항목을 다 받을 이유도 없다(알림 배지도 같은 방식이다).
 *
 * <b>polling 하지 않는다.</b> 대신 아래 세 시점에 다시 받는다.
 *
 *   1) 로그인 상태로 독이 처음 뜰 때
 *   2) <b>라우트가 바뀔 때</b> — 화면을 옮기는 것이 사용자가 자연히 만드는 갱신 기회다
 *   3) 신청·수락·거절 직후 (`refresh` 를 호출부가 부른다)
 *
 * 실패는 조용히 넘긴다. 배지는 보조 정보라, 못 받았다고 경고를 띄우면 화면을 가릴 뿐이다.
 */
export function useIncomingRequestCount(enabled: boolean) {
  const { pathname } = useLocation();
  const [count, setCount] = useState(0);
  /** 늦게 도착한 응답이 최신 값을 덮지 않게 한다 */
  const requestSeq = useRef(0);

  const load = useCallback(async () => {
    const seq = ++requestSeq.current;
    try {
      const data = await getIncomingRequests(0, 1);
      if (seq === requestSeq.current) setCount(data.page.totalElements);
    } catch {
      // 배지는 보조 정보다. 다음 라우트 이동에서 다시 시도한다.
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    // 이 규칙은 await 경계를 보지 않아 load 안의 setState 를 동기 호출로 본다.
    // 실제로는 응답이 온 뒤에만 상태가 바뀐다.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
    // pathname 이 의존성에 있는 것은 의도적이다 — 화면을 옮길 때마다 값을 새로 받는다.
  }, [enabled, load, pathname]);

  // 실시간 수신·재연결. 신청이 오거나 처리되면 배지를 곧바로 맞춘다.
  useEffect(() => {
    if (!enabled) return;
    const offFriendship = onUserEvent('friendship', () => void load());
    const offReconnect = onUserEvent('connected', () => void load());
    return () => {
      offFriendship();
      offReconnect();
    };
  }, [enabled, load]);

  return { count, refresh: load };
}
