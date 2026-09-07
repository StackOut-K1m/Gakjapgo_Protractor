// src/lib/ws/userEvents.ts
// 개인 채널(WebSocket)에서 받은 사건을 화면 쪽 훅에 전하는 아주 작은 버스.
//
// 훅들(useFriends·useNotifications·useDmConversation …)이 이미 자기 갱신 함수를 갖고 있어,
// 소켓 층이 그 함수만 부를 수 있으면 화면 코드를 고칠 일이 없다. 그런데 훅 안의 함수는
// 밖에서 부를 수 없으므로, 각 훅이 여기에 자기 처리기를 등록하고 소켓 층은 여기에 던진다.
//
// Zustand 스토어로 승격하지 않은 이유는 이 값들이 "상태"가 아니라 "사건"이기 때문이다.
// 같은 메시지가 두 번 와도 상태는 같지만, 처리는 두 번 일어나야 한다(중복 제거는 수신 쪽 몫).

import type { DmMessage } from '@/types/dm';
import type { NotificationItem } from '@/types/notification';

/** 친구 관계가 바뀌었다. 어느 쪽 변화든 목록·배지를 다시 받으면 된다 */
export interface FriendshipEvent {
  type: 'REQUESTED' | 'ACCEPTED' | 'REJECTED' | 'REMOVED';
  memberId: number;
  friendshipId?: number;
}

export interface DmEvent {
  roomId: number;
  message: DmMessage;
}

export type UserEventMap = {
  /** 내가 참여한 방에 메시지가 도착했다 */
  dm: DmEvent;
  /** 알림이 생겼다 */
  notification: NotificationItem;
  /** 친구 관계가 바뀌었다 */
  friendship: FriendshipEvent;
  /**
   * 연결이 (다시) 붙었다.
   *
   * 끊긴 동안의 변화는 구독으로 오지 않는다. 이 사건을 받은 쪽은 REST 로 현재 상태를
   * 한 번 맞춘다 — 스터디룸의 useRoomSocket 이 쓰는 "구독 + 스냅샷" 패턴과 같다.
   */
  connected: void;
};

type Handler<K extends keyof UserEventMap> = (payload: UserEventMap[K]) => void;

const handlers: { [K in keyof UserEventMap]: Set<Handler<K>> } = {
  dm: new Set(),
  notification: new Set(),
  friendship: new Set(),
  connected: new Set(),
};

/** 사건을 받는다. 돌려주는 함수를 호출하면 등록이 해제된다(효과 정리에서 쓴다). */
export function onUserEvent<K extends keyof UserEventMap>(
  type: K,
  handler: Handler<K>,
): () => void {
  handlers[type].add(handler);
  return () => {
    handlers[type].delete(handler);
  };
}

/** 사건을 던진다. 처리기 하나가 던져도 나머지는 계속 돌아야 한다 */
export function emitUserEvent<K extends keyof UserEventMap>(
  type: K,
  payload: UserEventMap[K],
): void {
  handlers[type].forEach((handler) => {
    try {
      handler(payload);
    } catch (e) {
      console.error(`[userEvents] ${type} 처리 실패`, e);
    }
  });
}
