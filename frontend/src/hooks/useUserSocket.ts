// src/hooks/useUserSocket.ts
import { useEffect, useRef } from 'react';

import { refreshAuthToken } from '@/api/client';
import { createStompClient } from '@/lib/ws/stompClient';
import { emitUserEvent } from '@/lib/ws/userEvents';
import { useAuthStore } from '@/stores/useAuthStore';
import type { DmEvent, FriendshipEvent } from '@/lib/ws/userEvents';
import type { NotificationItem } from '@/types/notification';

/**
 * 개인 채널 — 이 회원에게 오는 사건(DM·알림·친구)을 받는 하나의 연결.
 *
 * <b>RootLayout 에서 부른다.</b> 라우트가 바뀌어도 끊기지 않아야 하고, 로그인 상태면
 * 어느 화면에 있든 새 메시지를 받아야 한다.
 *
 * 스터디룸의 연결(useRoomSocket)과는 별개다. 그쪽은 방 단위 구독이고 별도 팝업 창이라
 * 서로 방해하지 않는다. 접속 주소·인증·재연결 규칙은 같은 모듈(stompClient)을 쓴다.
 *
 * ⚠️ <b>서버에 아래 채널이 아직 없다.</b> 구독은 성공하지만 아무것도 오지 않는다 —
 * 브로드캐스트가 붙는 순간 이 파일과 각 훅의 처리기가 그대로 동작한다. 그때까지 화면은
 * 기존 갱신 시점(창을 열 때·라우트 변경 등)으로 버틴다.
 * 요청 문서: .agents/protractor/Friendship-Backend-Request-Realtime.md
 */
export function useUserSocket(): void {
  const accessToken = useAuthStore((s) => s.accessToken);
  /** 토큰 갱신 중복 실행 방지. 재연결이 5초마다 반복돼도 갱신은 한 번만 나가게 한다 */
  const refreshingRef = useRef(false);

  useEffect(() => {
    if (!accessToken) return;
    let alive = true;

    const client = createStompClient(accessToken, {
      onConnect: (c) => {
        if (!alive) return;
        refreshingRef.current = false;

        // frame 타입을 직접 적어 둔다 — 필요한 것은 body 하나이고, 라이브러리 타입이
        // 없는 환경(의존성 미설치)에서도 이 파일은 그대로 검사를 통과한다.
        c.subscribe('/user/queue/dm', (frame: { body: string }) => {
          emitUserEvent('dm', JSON.parse(frame.body) as DmEvent);
        });

        c.subscribe('/user/queue/notifications', (frame: { body: string }) => {
          emitUserEvent(
            'notification',
            JSON.parse(frame.body) as NotificationItem,
          );
        });

        c.subscribe('/user/queue/friendship', (frame: { body: string }) => {
          emitUserEvent(
            'friendship',
            JSON.parse(frame.body) as FriendshipEvent,
          );
        });

        // 구독을 건 뒤에 알린다. 받는 쪽은 이 신호로 REST 스냅샷을 한 번 맞춘다 —
        // 끊긴 동안의 변화는 구독으로 오지 않기 때문이다.
        emitUserEvent('connected', undefined);
      },

      // 토큰 만료로 CONNECT 가 거부된 경우. 갱신되면 스토어의 accessToken 이 바뀌고
      // 이 효과가 다시 실행되면서 새 토큰으로 붙는다.
      onAuthError: () => {
        if (!alive || refreshingRef.current) return;
        refreshingRef.current = true;
        refreshAuthToken().catch(() => {
          // 갱신도 실패 = 재로그인 필요. 보호 라우트가 로그인 화면으로 보낸다.
          useAuthStore.getState().clearAuth();
        });
      },
    });

    client.activate();

    return () => {
      alive = false;
      // deactivate 가 구독 해제와 연결 종료를 함께 처리한다.
      void client.deactivate();
    };
  }, [accessToken]);
}
