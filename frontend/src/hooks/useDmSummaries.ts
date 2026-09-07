import { useCallback, useEffect, useRef, useState } from 'react';

import { getDmRooms } from '@/api/dmApi';
import { onUserEvent } from '@/lib/ws/userEvents';
import type { DmRoom } from '@/types/dm';

/**
 * 친구 목록 한 줄에 곁들일 대화 정보 — 마지막 메시지와 "안 읽은 것이 있는지".
 *
 * 근거는 서버가 주는 `unreadCount` 하나다(GET /dms). 예전에는 그 필드가 없어서 <b>안 읽은
 * DM 알림이 남아 있는지</b>로 우회했는데, 알림과 실제 읽음이 따로 움직여 어긋날 수 있었다.
 * 서버가 개수를 내주기 시작하면서 그 우회를 걷어냈다 — 알림 목록 조회 한 번도 함께 사라졌다.
 *
 * 개수는 받지만 화면에는 <b>점만</b> 찍는다(숫자 배지는 만들지 않는다).
 */
export function useDmSummaries(active: boolean) {
  /** 상대 회원 id → 방 정보. 친구 목록이 memberId 로 찾기 때문에 이 키를 쓴다 */
  const [byMemberId, setByMemberId] = useState<Map<number, DmRoom>>(new Map());

  const requestSeq = useRef(0);

  const load = useCallback(async () => {
    const seq = ++requestSeq.current;
    try {
      const rooms = await getDmRooms();
      if (seq !== requestSeq.current) return;
      setByMemberId(new Map(rooms.map((room) => [room.memberId, room])));
    } catch {
      // 곁들이는 정보다. 못 받아도 목록 자체는 보여야 하므로 조용히 넘긴다.
    }
  }, []);

  useEffect(() => {
    if (!active) return;
    // 이 규칙은 await 경계를 보지 않는다. 상태 변경은 모두 응답 뒤에 일어난다.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [active, load]);

  /**
   * 실시간 수신·재연결. 새 메시지가 오면 마지막 대화와 안 읽음 표시를 다시 받는다.
   *
   * 어느 방인지 가려 부분만 고칠 수도 있지만, 이 값은 목록 곁의 보조 정보이고 요청도
   * 가벼워서 통째로 다시 받는 편이 규칙이 단순하다.
   */
  useEffect(() => {
    if (!active) return;
    const offDm = onUserEvent('dm', () => void load());
    const offReconnect = onUserEvent('connected', () => void load());
    return () => {
      offDm();
      offReconnect();
    };
  }, [active, load]);

  /**
   * 그 방을 열었다 — 점을 먼저 지운다.
   *
   * 실제 읽음 처리는 대화 창이 한다(메시지 조회 또는 PATCH /dms/{roomId}/read). 여기서
   * 값을 0 으로 맞추는 것은 다음 조회가 오기 전까지 점이 남아 있지 않게 하려는 것뿐이다.
   */
  const markRoomSeen = useCallback((roomId: number) => {
    setByMemberId((prev) => {
      let changed = false;
      const next = new Map(prev);
      prev.forEach((room, memberId) => {
        if (room.roomId === roomId && (room.unreadCount ?? 0) > 0) {
          next.set(memberId, { ...room, unreadCount: 0 });
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, []);

  /** 이 친구와의 대화에 안 본 것이 있는가 */
  const hasUnread = useCallback(
    (memberId: number) => (byMemberId.get(memberId)?.unreadCount ?? 0) > 0,
    [byMemberId],
  );

  return { byMemberId, hasUnread, markRoomSeen, refresh: load };
}
