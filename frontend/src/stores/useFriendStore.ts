// src/stores/useFriendStore.ts
import { create } from 'zustand';

import {
  acceptFriendRequest,
  findRelation,
  getFriends,
  rejectFriendRequest,
  removeFriend as removeFriendApi,
  requestFriend as requestFriendApi,
} from '@/api/friendApi';
import type { FriendRelationStatus } from '@/types/friend';

/**
 * 한 상대와의 관계. 수락·거절은 memberId 가 아니라 friendshipId 로 부르기 때문에
 * 상태만으로는 부족하고 그 id 를 함께 들고 있어야 한다.
 */
export interface FriendRelation {
  status: FriendRelationStatus;
  /** 관계 행의 id. 아무 사이도 아니면 행이 없어서 null 이다 */
  friendshipId: number | null;
}

const UNKNOWN: FriendRelation = { status: 'NONE', friendshipId: null };

interface FriendState {
  /** memberId(문자열) → 관계. 아직 확인 안 한 상대는 아예 없다 */
  relations: Record<string, FriendRelation>;
  /** 지금 서버에 무언가 보내는 중인 상대. 버튼 중복 클릭을 막는다 */
  pending: Record<string, boolean>;

  /** 수락된 친구를 한 번에 받아 채운다. 방에 들어갈 때 한 번 부른다 */
  loadFriends: () => Promise<void>;
  /**
   * 이 상대와의 관계를 서버에서 확인해 캐시에 넣는다.
   *
   * 목록(loadFriends)으로는 <b>수락된</b> 관계만 알 수 있어서, 신청 중인지 받은 요청이
   * 있는지는 이걸로 따로 확인해야 한다. 메뉴나 프로필 카드를 열 때 그 사람 것만 부른다.
   */
  resolve: (memberId: string, nickname: string) => Promise<void>;

  request: (memberId: string) => Promise<void>;
  accept: (memberId: string) => Promise<void>;
  reject: (memberId: string) => Promise<void>;
  remove: (memberId: string) => Promise<void>;
}

/**
 * 친구 관계 — 서버 상태를 화면에서 나눠 쓰기 위한 캐시다.
 *
 * <p>
 * 예전에는 localStorage 목업이었다. 백엔드에 friendship 도메인이 없다고 알고 있었기
 * 때문인데, 실제로는 FriendshipController 에 7개 엔드포인트가 모두 있었다. 지금은 전부
 * 실제 API 를 부른다 — 여기 담기는 값은 서버가 준 것뿐이고, 새로고침하면 다시 받아 온다.
 *
 * <p>
 * persist 를 쓰지 않는 이유가 그것이다. 서버가 진실이라 브라우저에 남겨 둘 이유가 없고,
 * 남기면 상대가 그 사이 수락·거절한 것이 반영되지 않는다.
 */
export const useFriendStore = create<FriendState>()((set, get) => {
  /** 한 상대의 관계만 갈아 끼운다 */
  const put = (memberId: string, relation: FriendRelation) =>
    set((state) => ({
      relations: { ...state.relations, [memberId]: relation },
    }));

  const setPending = (memberId: string, value: boolean) =>
    set((state) => ({
      pending: { ...state.pending, [memberId]: value },
    }));

  /**
   * 서버에 무언가 보내고 그 결과로 관계를 갈아 끼운다.
   *
   * 실패하면 캐시를 건드리지 않고 예외를 그대로 올린다 — 부르는 쪽이 안내 문구를 띄운다.
   * 여기서 삼키면 눌렀는데 아무 일도 안 일어난 것처럼 보인다.
   */
  const run = async (
    memberId: string,
    action: () => Promise<FriendRelation>,
  ) => {
    if (get().pending[memberId]) return;
    setPending(memberId, true);
    try {
      put(memberId, await action());
    } finally {
      setPending(memberId, false);
    }
  };

  return {
    relations: {},
    pending: {},

    loadFriends: async () => {
      const { friends } = await getFriends();
      set((state) => {
        const next = { ...state.relations };
        for (const friend of friends) {
          next[String(friend.memberId)] = {
            status: friend.relationshipStatus,
            friendshipId: friend.friendshipId,
          };
        }
        return { relations: next };
      });
    },

    resolve: async (memberId, nickname) => {
      const found = await findRelation(Number(memberId), nickname);
      put(
        memberId,
        found
          ? {
              status: found.relationshipStatus,
              friendshipId: found.friendshipId,
            }
          : // 검색에 안 걸리면 관계가 없는 것으로 본다. 탈퇴한 회원도 여기로 온다.
            UNKNOWN,
      );
    },

    request: (memberId) =>
      run(memberId, async () => {
        const result = await requestFriendApi(Number(memberId));
        // 상대가 이미 나에게 신청해 둔 상태였다면 서버가 곧바로 수락 처리한다.
        // 그때는 PENDING 이 아니라 ACCEPTED 가 돌아오므로 응답을 그대로 믿는다.
        return {
          status: result.status === 'ACCEPTED' ? 'ACCEPTED' : 'OUTGOING',
          friendshipId: result.requestId,
        };
      }),

    accept: (memberId) =>
      run(memberId, async () => {
        const { friendshipId } = get().relations[memberId] ?? UNKNOWN;
        if (friendshipId === null) {
          throw new Error('수락할 요청을 찾지 못했습니다.');
        }
        const result = await acceptFriendRequest(friendshipId);
        return { status: 'ACCEPTED', friendshipId: result.requestId };
      }),

    reject: (memberId) =>
      run(memberId, async () => {
        const { friendshipId } = get().relations[memberId] ?? UNKNOWN;
        if (friendshipId === null) {
          throw new Error('거절할 요청을 찾지 못했습니다.');
        }
        await rejectFriendRequest(friendshipId);
        // 거절하면 관계 행은 REJECTED 로 남지만 화면에서는 '아무 사이도 아님'과 같다.
        return UNKNOWN;
      }),

    remove: (memberId) =>
      run(memberId, async () => {
        await removeFriendApi(Number(memberId));
        return UNKNOWN;
      }),
  };
});

/** 이 상대와의 관계. 맵 전체가 아니라 값 하나를 구독해 불필요한 리렌더를 막는다. */
export const useFriendRelation = (memberId: string): FriendRelation =>
  useFriendStore((state) => state.relations[memberId] ?? UNKNOWN);

export const useFriendStatus = (memberId: string): FriendRelationStatus =>
  useFriendStore((state) => state.relations[memberId]?.status ?? 'NONE');

export const useIsFriend = (memberId: string) =>
  useFriendStatus(memberId) === 'ACCEPTED';

/** 이 상대에게 보낸 요청이 아직 처리 중인지 */
export const useFriendPending = (memberId: string) =>
  useFriendStore((state) => state.pending[memberId] ?? false);
