// src/hooks/useRoomSocket.ts
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Client } from '@stomp/stompjs';

import { refreshAuthToken } from '@/api/client';
import {
  getMediaStates,
  getParticipants,
  getRecentMessages,
  getRoomTimerState,
} from '@/api/studyRoomApi';
import {
  coachingBody,
  coachingDestination,
  coachingTopic,
  parseCoachingFrame,
} from '@/lib/ws/coachingChannel';
import { createStompClient } from '@/lib/ws/stompClient';
import { useAuthStore } from '@/stores/useAuthStore';
import type {
  ChatMessage,
  ChatMessageEvent,
  CoachingState,
  MediaStateEvent,
  Participant,
  ParticipantEvent,
  TimerPhaseEvent,
  TimerStateDto,
} from '@/types/room';

/** 타이머가 돌고 있지 않은 상태. 서버의 notRunning 응답과 같은 모양이다. */
const STOPPED_TIMER: TimerStateDto = {
  running: false,
  phase: null,
  sequence: null,
  durationSeconds: null,
  remainingSeconds: null,
  stretchingEnabled: false,
};

/** 서버가 준 시각(LocalDateTime 문자열)을 화면용 'HH:MM' 으로 바꾼다. 형식이 예상과 다르면 그대로 둔다. */
function formatSentAt(sentAt: string): string {
  const date = new Date(sentAt);
  if (Number.isNaN(date.getTime())) return sentAt;
  return date.toLocaleTimeString('ko-KR', {
    hour: 'numeric',
    minute: '2-digit',
  });
}

/**
 * 스터디룸 실시간 연결.
 *
 * 방 하나당 WebSocket 연결 하나를 쓰고, 그 위에 참여자·채팅·미디어 상태 구독을 얹는다.
 * 연결이 끊겼다 붙으면 구독이 사라지므로 onConnect 안에서 매번 다시 구독한다.
 *
 * 구독만으로는 "그 뒤에 일어난 일"만 알 수 있어서, 연결될 때마다 현재 상태를 REST 로 한 번 맞춘다.
 * 먼저 들어와 있던 사람, 끊긴 동안의 변화, 새로고침 전 대화가 이 과정으로 복구된다.
 *
 * 이 연결은 서버에서 "접속 중" 신호로도 쓰인다. 끊긴 채 돌아오지 않으면 서버가 퇴장으로 처리한다.
 */
export function useRoomSocket(
  roomId: string | undefined,
  /** 같은 계정이 다른 탭에서 이 방에 들어와 이 화면이 밀려날 때 호출된다. */
  onEvicted?: () => void,
) {
  const accessToken = useAuthStore((s) => s.accessToken);
  const myMemberId = useAuthStore((s) => s.member?.memberId ?? null);

  // 콜백이 매 렌더 새로 만들어져도 WebSocket을 다시 연결하지 않도록 ref로 참조한다.
  const onEvictedRef = useRef(onEvicted);
  useEffect(() => {
    onEvictedRef.current = onEvicted;
  }, [onEvicted]);

  const [connected, setConnected] = useState(false);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  /** 방 타이머 진행 상태. 방장이 시작하면 방 전원이 같은 값을 본다. */
  const [timerState, setTimerState] = useState<TimerStateDto>(STOPPED_TIMER);
  const clientRef = useRef<Client | null>(null);
  /** 토큰 갱신 중복 실행 방지. 재연결이 5초마다 반복돼도 갱신 요청은 한 번만 나가게 한다. */
  const refreshingRef = useRef(false);
  /** 보내는 중인 메시지에 붙일 임시 번호. 같은 내용을 연달아 보내도 key 가 겹치지 않게 한다. */
  const pendingSeq = useRef(0);
  /** sendMessage 가 매번 새로 만들어지지 않도록 roomId 는 ref 로 참조한다. */
  const roomIdRef = useRef(roomId);
  useEffect(() => {
    roomIdRef.current = roomId;
  }, [roomId]);

  /**
   * 마지막으로 알린 내 코칭 상태.
   *
   * 서버가 이 값을 보관하지 않아서(coachingChannel 주석 참고), 뒤늦게 들어온 사람은 내가
   * 이미 경고 중이어도 모른 채 시작한다. 그래서 누가 들어올 때마다 이 값을 다시 한 번 보낸다.
   */
  const myCoachingStateRef = useRef<CoachingState>('none');

  // 본인 판별에만 쓰는 값이라 ref 로 둔다. 의존성에 넣으면 로그인 정보가 늦게 채워질 때
  // WebSocket 이 불필요하게 끊었다 다시 붙는다.
  const myMemberIdRef = useRef(myMemberId);
  useEffect(() => {
    myMemberIdRef.current = myMemberId;
  }, [myMemberId]);

  const toParticipant = useCallback(
    (
      memberId: number,
      nickname: string,
      profileImageUrl?: string | null,
    ): Participant => ({
      id: String(memberId),
      name: nickname,
      profileImageUrl,
      isSelf: memberId === myMemberIdRef.current,
      // 실제 상태는 미디어 이벤트·스냅샷으로 곧 채워진다. 그전까지는 켜져 있다고 본다.
      cameraOn: true,
      micOn: true,
      // 화면공유는 반대다. 켜져 있다고 넘겨짚으면 평범한 카메라 영상이 잠깐 뒤집혀 보인다.
      screenSharing: false,
      // 경고·스트레칭도 마찬가지로 없다고 보고 시작한다. 상대가 그 상태면 곧 알려 온다.
      coachingState: 'none',
    }),
    [],
  );

  useEffect(() => {
    if (!roomId || !accessToken) return;
    let alive = true;

    /** 현재 참여자 스냅샷을 받아 목록을 맞춘다. 구독만으로는 이미 들어와 있던 사람을 알 수 없다. */
    const syncParticipants = () => {
      getParticipants(Number(roomId))
        .then((list) => {
          if (!alive) return;
          setParticipants(
            list.map((p) =>
              toParticipant(p.memberId, p.nickname, p.profileImageUrl),
            ),
          );
        })
        .catch(() => {
          // 스냅샷을 못 받아도 이후 실시간 이벤트로는 갱신되므로 화면을 막지 않는다.
        });
    };

    /** 받은 미디어 상태를 해당 참여자 타일에 반영한다. 아직 목록에 없는 사람은 무시(입퇴장 이벤트가 채운다). */
    const applyMediaState = (event: MediaStateEvent) => {
      setParticipants((prev) =>
        prev.map((p) =>
          p.id === String(event.memberId)
            ? {
                ...p,
                cameraOn: event.cameraOn,
                micOn: event.micOn,
                screenSharing: event.screenSharing,
              }
            : p,
        ),
      );
    };

    /** 이미 들어와 있던 사람들의 현재 상태. 구독만으로는 알 수 없어 한 번 받아 온다. */
    const syncMediaStates = () => {
      getMediaStates(Number(roomId))
        .then((states) => {
          if (!alive) return;
          states.forEach(applyMediaState);
        })
        .catch(() => {
          // 못 받아도 이후 변화는 실시간으로 들어온다.
        });
    };

    /**
     * 최근 대화를 받아 채팅창을 채운다. 새로고침하면 구독 이전 메시지는 못 받기 때문이다.
     * 재연결 때도 실행되므로, 이미 있는 메시지는 id 로 걸러 중복 표시를 막는다.
     */
    const syncMessages = () => {
      getRecentMessages(Number(roomId))
        .then((history) => {
          if (!alive || history.length === 0) return;
          setMessages((prev) => {
            const known = new Set(prev.map((m) => m.id));
            const restored = history
              .filter((h) => !known.has(h.messageId))
              .map((h) => ({
                id: h.messageId,
                authorId: String(h.senderId),
                authorName: h.senderNickname,
                sentAt: formatSentAt(h.sentAt),
                body: h.content,
                isSelf: h.senderId === myMemberIdRef.current,
              }));
            return restored.length === 0 ? prev : [...restored, ...prev];
          });
        })
        .catch(() => {
          // 이력을 못 받아도 이후 대화는 실시간으로 들어온다.
        });
    };

    /**
     * 지금 몇 번째 구간에 몇 초 남았는지 한 번 맞춘다.
     * 구독만으로는 다음 전환까지 알 수 없어서, 중간에 들어온 사람은 이게 없으면 계속 모른다.
     */
    const syncTimerState = () => {
      getRoomTimerState(Number(roomId))
        .then((state) => {
          if (alive) setTimerState(state);
        })
        .catch(() => {
          // 못 받아도 다음 페이즈 전환 브로드캐스트로 맞춰진다.
        });
    };

    const client = createStompClient(accessToken, {
      onConnect: (c) => {
        if (!alive) return;
        setConnected(true);
        // 연결에 성공했으니 다음 만료 때 다시 갱신할 수 있게 풀어둔다.
        refreshingRef.current = false;

        c.subscribe(`/topic/study-rooms/${roomId}/participants`, (frame) => {
          const event: ParticipantEvent = JSON.parse(frame.body);

          // 새로 들어온 사람은 내가 지금 경고·스트레칭 중인 것을 모른다. 서버가 상태를
          // 보관하지 않으므로 여기서 다시 알린다. 평소(none)에는 보낼 필요가 없다.
          if (
            event.type === 'JOINED' &&
            myMemberIdRef.current !== null &&
            event.memberId !== myMemberIdRef.current &&
            myCoachingStateRef.current !== 'none'
          ) {
            c.publish({
              destination: coachingDestination(roomId),
              body: coachingBody(
                myMemberIdRef.current,
                myCoachingStateRef.current,
              ),
            });
          }

          setParticipants((prev) => {
            if (event.type === 'LEFT') {
              return prev.filter((p) => p.id !== String(event.memberId));
            }
            // 재입장·중복 이벤트로 같은 사람이 두 번 들어오지 않게 막는다.
            if (prev.some((p) => p.id === String(event.memberId))) return prev;
            return [
              ...prev,
              toParticipant(
                event.memberId,
                event.nickname,
                event.profileImageUrl,
              ),
            ];
          });
        });

        c.subscribe(`/topic/study-rooms/${roomId}/messages`, (frame) => {
          const event: ChatMessageEvent = JSON.parse(frame.body);
          const arrived: ChatMessage = {
            id: event.messageId,
            authorId: String(event.senderId),
            authorName: event.senderNickname,
            sentAt: formatSentAt(event.sentAt),
            body: event.content,
            isSelf: event.senderId === myMemberIdRef.current,
          };

          setMessages((prev) => {
            // 내가 보낸 메시지는 화면에 미리 띄워 뒀다. 서버가 되돌려준 것을 그냥 붙이면
            // 같은 말이 두 번 보이므로, 기다리던 자리를 확정본으로 갈아 끼운다.
            if (event.senderId === myMemberIdRef.current) {
              const waiting = prev.findIndex(
                (m) => m.pending && m.body === event.content,
              );
              if (waiting !== -1) {
                const next = [...prev];
                next[waiting] = arrived;
                return next;
              }
            }
            return [...prev, arrived];
          });
        });

        c.subscribe(`/topic/study-rooms/${roomId}/media`, (frame) => {
          const event: MediaStateEvent = JSON.parse(frame.body);
          applyMediaState(event);
        });

        // 코칭 상태(자세 경고·스트레칭). 판정은 각자 브라우저에서만 돌기 때문에
        // 이 통로로 알리지 않으면 다른 사람 화면에는 아무 표시도 뜰 수 없다.
        // 내가 보낸 것도 되돌아오므로 내 타일도 같은 경로로 색이 바뀐다.
        c.subscribe(coachingTopic(roomId), (frame) => {
          const event = parseCoachingFrame(frame.body);
          if (!event) return;
          setParticipants((prev) =>
            prev.map((p) =>
              p.id === String(event.memberId)
                ? { ...p, coachingState: event.state }
                : p,
            ),
          );
        });

        // 방 타이머 — 방장이 시작하거나 집중↔휴식이 바뀔 때 방 전원에게 온다.
        // 모두가 같은 이벤트를 받으므로 구간이 사람마다 어긋나지 않는다.
        c.subscribe(`/topic/study-rooms/${roomId}/timer`, (frame) => {
          const event: TimerPhaseEvent = JSON.parse(frame.body);
          setTimerState(
            event.type === 'STOPPED'
              ? STOPPED_TIMER
              : {
                  running: true,
                  phase: event.phase,
                  sequence: event.sequence,
                  durationSeconds: event.durationSeconds,
                  remainingSeconds: event.remainingSeconds,
                  stretchingEnabled: event.stretchingEnabled,
                },
          );
        });

        // 같은 계정이 다른 탭·창으로 이 방에 들어오면 서버가 이 접속에만 종료를 알린다.
        // 화면 두 개가 같이 떠 있으면 카메라·자세 판정이 이중으로 돌기 때문에 먼저 있던 쪽이 나간다.
        c.subscribe('/user/queue/session-evicted', () => {
          if (alive) onEvictedRef.current?.();
        });

        // 끊겼다 붙는 동안 내가 보낸 상태는 아무도 못 받았고, 서버도 보관하지 않는다.
        // 평소가 아니라면 다시 알린다 — 안 그러면 경고 중에 재연결된 사람만 테두리가 빠진다.
        if (
          myCoachingStateRef.current !== 'none' &&
          myMemberIdRef.current !== null
        ) {
          c.publish({
            destination: coachingDestination(roomId),
            body: coachingBody(
              myMemberIdRef.current,
              myCoachingStateRef.current,
            ),
          });
        }

        // 구독을 건 뒤에 스냅샷을 받아야 그 사이 입퇴장·상태 변화를 놓치지 않는다.
        // 재연결 때도 실행되어 끊긴 동안의 변화를 따라잡는다.
        syncParticipants();
        syncMediaStates();
        syncMessages();
        syncTimerState();
      },

      // 토큰 만료로 CONNECT 가 거부된 경우. 갱신에 성공하면 스토어의 accessToken 이 바뀌고,
      // 이 효과가 다시 실행되면서 새 토큰으로 접속한다.
      // 재연결이 5초마다 반복되므로, 갱신이 끝나기 전에 또 요청하지 않도록 플래그로 막는다.
      onAuthError: () => {
        if (!alive || refreshingRef.current) return;
        refreshingRef.current = true;
        refreshAuthToken().catch(() => {
          // 갱신도 실패 = 재로그인 필요. 보호 라우트가 로그인 화면으로 보낸다.
          useAuthStore.getState().clearAuth();
        });
      },
    });

    client.onWebSocketClose = () => {
      if (alive) setConnected(false);
    };

    client.activate();
    clientRef.current = client;

    return () => {
      alive = false;
      clientRef.current = null;
      setConnected(false);
      // deactivate 가 구독 해제와 연결 종료를 함께 처리한다.
      void client.deactivate();
    };
  }, [roomId, accessToken, toParticipant]);

  /**
   * 채팅 전송.
   *
   * 보낸 메시지를 화면에 먼저 띄우고(pending), 서버가 되돌려준 확정본으로 갈아 끼운다.
   * 서버 왕복을 기다렸다 띄우면 엔터를 친 뒤 잠깐 아무것도 없는 구간이 생겨 느리게 느껴진다.
   * 중복 표시는 구독 쪽에서 pending 자리를 교체하는 방식으로 막는다.
   */
  const sendMessage = useCallback((content: string) => {
    const body = content.trim();
    const client = clientRef.current;
    if (!body || !client?.connected) return;

    client.publish({
      destination: `/app/study-rooms/${roomIdRef.current}/messages`,
      body: JSON.stringify({ content: body }),
    });

    // 확정본이 오면 이 항목은 사라진다. id 는 서버 UUID 와 겹치지 않게 접두사를 붙인다.
    pendingSeq.current += 1;
    const draft: ChatMessage = {
      id: `pending-${pendingSeq.current}`,
      authorId: String(myMemberIdRef.current ?? ''),
      authorName: useAuthStore.getState().member?.nickname ?? '나',
      sentAt: formatSentAt(new Date().toISOString()),
      body,
      isSelf: true,
      pending: true,
    };
    setMessages((prev) => [...prev, draft]);
  }, []);

  /**
   * 내 미디어 상태를 방에 알린다. 카메라·마이크를 껐다 켜거나 화면 공유를 시작·중지할 때 부른다.
   *
   * 실제 송출 차단은 OpenVidu publisher 가 하고, 이 값은 상대 화면 표시용이다.
   */
  const sendMediaState = useCallback(
    (state: { cameraOn: boolean; micOn: boolean; screenSharing?: boolean }) => {
      const client = clientRef.current;
      if (!client?.connected) return;
      client.publish({
        destination: `/app/study-rooms/${roomIdRef.current}/media`,
        body: JSON.stringify({
          cameraOn: state.cameraOn,
          micOn: state.micOn,
          screenSharing: state.screenSharing ?? false,
        }),
      });
    },
    [],
  );

  /**
   * 내 코칭 상태를 방에 알린다. 경고가 뜨고 사라질 때, 스트레칭을 시작하고 끝낼 때 부른다.
   *
   * 같은 값을 다시 보내지 않는다 — 자세 판정이 1초마다 도는 탓에 상태가 안 바뀌어도 계속
   * 호출되는데, 그대로 내보내면 방 인원수만큼 곱해진 메시지가 초당 한 번씩 오간다.
   */
  const sendCoachingState = useCallback((state: CoachingState) => {
    if (myCoachingStateRef.current === state) return;
    myCoachingStateRef.current = state;

    const client = clientRef.current;
    const memberId = myMemberIdRef.current;
    // 내가 누구인지 모르면 보내도 받는 쪽이 어느 타일인지 못 정한다. 로그인 정보가 채워지면
    // 다음 상태 변화나 재연결 때 다시 나간다.
    if (!client?.connected || memberId === null) return;
    client.publish({
      destination: coachingDestination(roomIdRef.current ?? ''),
      body: coachingBody(memberId, state),
    });
  }, []);

  return {
    connected,
    participants,
    messages,
    timerState,
    sendMessage,
    sendMediaState,
    sendCoachingState,
  };
}
