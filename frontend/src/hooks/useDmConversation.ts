import { useCallback, useEffect, useRef, useState } from 'react';

import { getApiErrorMessage } from '@/api/client';
import {
  getDmMessages,
  getDmRooms,
  markDmRoomRead,
  sendDmMessage as postDmMessage,
} from '@/api/dmApi';
import { onUserEvent } from '@/lib/ws/userEvents';
import { useAuthStore } from '@/stores/useAuthStore';
import type { DmMessage, DmMessageView, DmRoom } from '@/types/dm';

/**
 * 이 시간이 지난 뒤 창을 다시 보면 메시지를 새로 받는다(ms).
 *
 * <b>조회 자체가 읽음 처리를 겸하므로</b> 자주 부를 수 없다. 최소화된 창이나 숨겨진 탭에서
 * 부르면 사용자가 읽지 않은 메시지에 읽음 표시가 가고, 상대는 읽은 줄 안다.
 */
const REFETCH_AFTER_MS = 15_000;

/**
 * DM 대화 한 건.
 *
 * <b>방 번호만으로 시작한다.</b> 상대 정보(닉네임·사진)는 방 목록에서 찾아 채운다. 친구 목록에서
 * 열면 상대를 이미 알지만, 알림에서 열 때는 `referenceId`(방 번호)뿐이라 그 경로도 되어야 한다.
 *
 * <b>polling 하지 않는다.</b> 새 메시지는 알림이 알려 주고, 이 훅은 창을 열 때와 다시 볼 때
 * 받는다. WebSocket 이 붙으면 아래 `appendMessage` 를 구독 콜백에서 부르면 되고, 그 밖의
 * 코드는 그대로 둘 수 있다.
 */
export function useDmConversation(roomId: number | null, active: boolean) {
  const myMemberId = useAuthStore((s) => s.member?.memberId ?? null);

  const [peer, setPeer] = useState<DmRoom | null>(null);
  const [messages, setMessages] = useState<DmMessageView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  /** 더 받을 지난 대화가 있는가 */
  const [hasOlder, setHasOlder] = useState(false);
  /** 다음에 받을 지난 대화 페이지 */
  const olderPage = useRef(1);

  const fetchedAt = useRef(0);
  const requestSeq = useRef(0);
  /** 보낸 메시지에 붙일 임시 번호. 서버 id 와 겹치지 않게 음수를 쓴다 */
  const pendingSeq = useRef(0);

  /**
   * 목록에 메시지를 한 건 얹는다.
   *
   * <b>새 메시지가 들어오는 길은 이 함수 하나다.</b> 나중에 WebSocket 수신을 붙일 때도
   * 여기만 부르면 되므로, 중복 제거·임시 항목 교체 규칙이 한곳에 모인다.
   */
  const appendMessage = useCallback((message: DmMessage) => {
    setMessages((prev) => {
      // 이미 있는 메시지면 무시한다(재조회·재연결로 같은 건이 두 번 올 수 있다)
      if (prev.some((m) => m.messageId === message.messageId)) return prev;

      // 내가 보낸 것이면 기다리던 임시 항목을 확정본으로 갈아 끼운다.
      const waiting = prev.findIndex(
        (m) => m.pending && m.content === message.content,
      );
      if (waiting !== -1) {
        const next = [...prev];
        next[waiting] = message;
        return next;
      }
      return [...prev, message];
    });
  }, []);

  /** 첫 페이지(최근 대화)를 받는다. 상태 변경은 응답이 온 뒤에만 한다 */
  const load = useCallback(async () => {
    if (roomId === null) return;
    const seq = ++requestSeq.current;
    try {
      // 상대 정보는 방 목록에서 찾는다. 친구가 아니면 목록에 없다(서버가 걸러 준다).
      const [rooms, page] = await Promise.all([
        getDmRooms(),
        getDmMessages(roomId, 0),
      ]);
      if (seq !== requestSeq.current) return;

      const found = rooms.find((r) => r.roomId === roomId) ?? null;
      setPeer(found);
      setMessages(page.messages);
      setHasOlder(page.page.totalPages > 1);
      olderPage.current = 1;
      setError(
        found === null
          ? '친구 관계가 아니어서 대화를 볼 수 없습니다. 목록을 새로 불러왔습니다.'
          : null,
      );
      fetchedAt.current = Date.now();
    } catch (e) {
      if (seq !== requestSeq.current) return;
      setError(getApiErrorMessage(e, '대화를 불러오지 못했습니다.'));
    } finally {
      if (seq === requestSeq.current) setLoading(false);
    }
  }, [roomId]);

  // 방이 바뀌면 처음부터 다시 시작한다. 최소화 중에는 받지 않는다 — 조회가 읽음 처리를 겸한다.
  useEffect(() => {
    if (roomId === null || !active) return;
    // 이 규칙은 await 경계를 보지 않는다. load 안의 setState 는 모두 응답 뒤에 일어난다.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [roomId, active, load]);

  // 다른 창을 보다 돌아왔을 때. 잠깐 다녀온 경우까지 매번 받지는 않는다.
  useEffect(() => {
    if (roomId === null || !active) return;
    const handleVisibility = () => {
      if (document.visibilityState !== 'visible') return;
      if (Date.now() - fetchedAt.current < REFETCH_AFTER_MS) return;
      void load();
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () =>
      document.removeEventListener('visibilitychange', handleVisibility);
  }, [roomId, active, load]);

  /**
   * 실시간 수신. 이 방 메시지면 바로 목록에 얹는다.
   *
   * 최소화 중에도 받는다 — 이건 조회가 아니라 밀려 오는 값이라 읽음 처리가 딸려오지 않는다.
   * 서버 브로드캐스트가 붙기 전에는 아무것도 오지 않으므로 지금은 조용히 대기한다.
   */
  useEffect(() => {
    if (roomId === null) return;
    return onUserEvent('dm', (event) => {
      if (event.roomId !== roomId) return;
      appendMessage(event.message);

      // 보고 있는 대화라면 읽음 처리한다. 조회에 딸려 오던 처리가 실시간 수신에는 없어서,
      // 이걸 빠뜨리면 상대에게 읽음 표시가 영영 가지 않는다.
      // 최소화된 창(active=false)에서는 부르지 않는다 — 보지 않은 대화가 읽음이 된다.
      if (active && document.visibilityState === 'visible') {
        void markDmRoomRead(roomId).catch(() => {
          // 읽음 표시는 보조 정보다. 실패하면 다음 수신이나 재조회에서 다시 맞춰진다.
        });
      }
    });
  }, [roomId, active, appendMessage]);

  /** 지난 대화를 더 받아 위에 붙인다 */
  const loadOlder = useCallback(async () => {
    if (roomId === null || !hasOlder) return;
    const page = olderPage.current;
    try {
      const data = await getDmMessages(roomId, page);
      setMessages((prev) => [...data.messages, ...prev]);
      olderPage.current = page + 1;
      setHasOlder(page + 1 < data.page.totalPages);
    } catch (e) {
      setError(getApiErrorMessage(e, '지난 대화를 불러오지 못했습니다.'));
    }
  }, [roomId, hasOlder]);

  /**
   * 메시지 전송.
   *
   * 화면에 먼저 띄우고(임시 항목) 서버 응답으로 갈아 끼운다. 왕복을 기다렸다 띄우면 엔터를
   * 친 뒤 잠깐 아무것도 없는 구간이 생겨 느리게 느껴진다.
   *
   * 전송만은 REST 로 둔다. 응답에 확정 id·시각이 들어 있어 실패를 분명히 알 수 있다 —
   * WebSocket 으로 보내면 성공했는지 알 방법이 마땅치 않다.
   */
  const send = useCallback(
    async (raw: string) => {
      const content = raw.trim();
      if (roomId === null || !content || sending) return;

      pendingSeq.current -= 1;
      const draft: DmMessageView = {
        messageId: pendingSeq.current,
        senderMemberId: myMemberId ?? 0,
        content,
        sentAt: new Date().toISOString(),
        readAt: null,
        pending: true,
      };
      setMessages((prev) => [...prev, draft]);
      setSending(true);

      try {
        const saved = await postDmMessage(roomId, content);
        appendMessage(saved);
      } catch (e) {
        // 실패한 임시 항목은 걷어낸다. 남겨 두면 보낸 것처럼 보인다.
        setMessages((prev) =>
          prev.filter((m) => m.messageId !== draft.messageId),
        );
        setError(
          getApiErrorMessage(
            e,
            '메시지를 보내지 못했습니다. 다시 시도해 주세요.',
          ),
        );
      } finally {
        setSending(false);
      }
    },
    [roomId, sending, myMemberId, appendMessage],
  );

  return {
    peer,
    messages,
    loading,
    error,
    sending,
    hasOlder,
    loadOlder,
    send,
    myMemberId,
  };
}
