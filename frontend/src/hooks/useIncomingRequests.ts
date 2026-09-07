import { useCallback, useEffect, useRef, useState } from 'react';

import { getApiErrorMessage } from '@/api/client';
import { getIncomingRequests } from '@/api/friendApi';
import type { FriendItem } from '@/types/friend';

/**
 * 내가 받은 친구 신청 목록.
 *
 * 서버가 대기 중인 것만 최신 신청순으로 주므로 화면에서 걸러내거나 정렬하지 않는다.
 * 목록 조회는 이 훅 하나만 쓴다 — 화면(요청 탭)은 반환값만 보고 그린다.
 *
 * <b>polling 하지 않는다.</b> 새 신청은 헤더의 알림 종이 알려 주고, 이 훅은 창을 열 때와
 * 수락·거절 직후에만 받는다.
 */
export function useIncomingRequests() {
  const [requests, setRequests] = useState<FriendItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const requestSeq = useRef(0);

  /**
   * 목록을 받아 상태에 반영한다.
   *
   * 상태 변경은 <b>await 뒤에만</b> 한다. 아래 효과가 이 함수를 바로 부르는데, 효과 본문에서
   * 동기적으로 setState 를 하면 렌더가 한 번 더 돌기 때문이다(react-hooks/set-state-in-effect).
   * 그래서 '불러오는 중' 은 초기값(true)으로 두고, 여기서 다시 켜지 않는다.
   */
  const load = useCallback(async () => {
    const seq = ++requestSeq.current;
    try {
      const data = await getIncomingRequests();
      if (seq !== requestSeq.current) return;
      setRequests(data.friends);
      setError(null);
    } catch (e) {
      if (seq !== requestSeq.current) return;
      setError(getApiErrorMessage(e, '받은 신청을 불러오지 못했습니다.'));
    } finally {
      if (seq === requestSeq.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    // 이 규칙은 await 경계를 보지 않아서, load 안의 setState 가 모두 응답이 온 뒤에 일어나는
    // 것을 구분하지 못한다(효과 본문에서 동기적으로 부르는 setState 는 없다).
    // 창을 열 때 한 번은 받아야 하므로 여기서 부른다.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  /** 다시 받는다. 수락·거절 뒤에 부른다 — 이때는 '불러오는 중'을 다시 켠다. */
  const refresh = useCallback(() => {
    setLoading(true);
    void load();
  }, [load]);

  return { requests, loading, error, refresh };
}
