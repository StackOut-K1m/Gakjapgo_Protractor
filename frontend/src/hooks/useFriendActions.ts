import { useCallback, useState } from 'react';
import axios from 'axios';

import { getApiErrorMessage } from '@/api/client';
import {
  acceptFriendRequest,
  rejectFriendRequest,
  removeFriend,
  requestFriend,
} from '@/api/friendApi';
import { requestResultMessage } from '@/lib/friend/relationship';

interface UseFriendActionsOptions {
  /**
   * 목록을 다시 받아야 할 때 호출된다.
   *
   * 성공했을 때만이 아니라 <b>상태가 어긋났을 때도</b> 부른다. 403·404·409 는 "화면이 들고 있는
   * 관계가 서버와 다르다"는 뜻이라, 그대로 두면 사용자가 같은 버튼을 계속 누르게 된다.
   */
  onChanged?: () => void;
}

/**
 * 관계를 바꾸는 네 가지 동작(신청·수락·거절·삭제)을 한곳에서 처리한다.
 *
 * 세 화면(검색 결과·받은 요청·친구 목록)이 같은 API 를 부르고 같은 오류를 만나므로,
 * 문구와 재조회 규칙을 한 번만 적어 둔다.
 *
 * 낙관적 갱신은 하지 않는다 — 신청은 응답 `status` 에 따라 '대기 중'과 '바로 친구'로 갈리고,
 * 수락·거절은 이미 처리된 건일 수 있다. 결과를 보고 화면을 맞추는 편이 정확하다.
 * (삭제만 예외로 호출부가 목록에서 먼저 지운다 — useFriends.removeLocally)
 */
export function useFriendActions({ onChanged }: UseFriendActionsOptions = {}) {
  /** 지금 처리 중인 상대. 버튼을 잠가 두어 같은 요청이 두 번 나가지 않게 한다 */
  const [busyMemberId, setBusyMemberId] = useState<number | null>(null);
  /** 사용자에게 보여줄 결과·오류 한 줄. null 이면 없음 */
  const [notice, setNotice] = useState<string | null>(null);

  const clearNotice = useCallback(() => setNotice(null), []);

  /**
   * 공통 처리. 어떤 동작이든 끝나면 목록을 다시 받는다.
   *
   * @param memberId 버튼을 잠글 대상
   * @param run 실제 API 호출. 성공 문구를 돌려주면 그대로 보여준다
   */
  const run = useCallback(
    async (
      memberId: number,
      task: () => Promise<string | null>,
      fallbackMessage: string,
    ) => {
      if (busyMemberId !== null) return;
      setBusyMemberId(memberId);
      setNotice(null);
      try {
        const message = await task();
        if (message) setNotice(message);
        onChanged?.();
      } catch (e) {
        setNotice(describeFriendError(e, fallbackMessage));
        // 상태가 어긋난 오류(403·404·409)면 목록을 맞춘다. 네트워크 오류라면 다시 받아도
        // 실패하겠지만, 그때는 목록 쪽에서 자기 오류를 보여준다.
        if (isStaleStateError(e)) onChanged?.();
      } finally {
        setBusyMemberId(null);
      }
    },
    [busyMemberId, onChanged],
  );

  /** 친구 신청. 상대가 이미 나에게 신청해 둔 상태였다면 곧바로 친구가 된다. */
  const request = useCallback(
    (memberId: number) =>
      run(
        memberId,
        async () => {
          const result = await requestFriend(memberId);
          // REJECTED 로 돌아올 일은 없지만, 그때 잘못된 안내를 하지 않도록 두 경우만 다룬다.
          return result.status === 'REJECTED'
            ? null
            : requestResultMessage(result.status);
        },
        '친구 신청에 실패했습니다.',
      ),
    [run],
  );

  const accept = useCallback(
    (memberId: number, friendshipId: number) =>
      run(
        memberId,
        async () => {
          await acceptFriendRequest(friendshipId);
          return '친구 신청을 수락했습니다.';
        },
        '수락에 실패했습니다.',
      ),
    [run],
  );

  const reject = useCallback(
    (memberId: number, friendshipId: number) =>
      run(
        memberId,
        async () => {
          await rejectFriendRequest(friendshipId);
          return '친구 신청을 거절했습니다.';
        },
        '거절에 실패했습니다.',
      ),
    [run],
  );

  /**
   * 친구 삭제. 호출부는 확인을 받은 뒤 부르고, 열려 있던 DM 창도 함께 닫아야 한다.
   * 남겨 두면 그 창의 다음 조회·전송이 모두 403 이 된다.
   */
  const remove = useCallback(
    (memberId: number) =>
      run(
        memberId,
        async () => {
          await removeFriend(memberId);
          return null; // 목록에서 사라지는 것으로 충분하다 — 문구까지 띄우면 잔소리가 된다
        },
        '친구 삭제에 실패했습니다.',
      ),
    [run],
  );

  return { busyMemberId, notice, clearNotice, request, accept, reject, remove };
}

/** 상태 충돌 계열 오류인가. 이 경우 목록을 다시 받아야 화면이 서버와 맞는다. */
function isStaleStateError(error: unknown): boolean {
  if (!axios.isAxiosError(error)) return false;
  const status = error.response?.status;
  return status === 403 || status === 404 || status === 409;
}

/**
 * 친구 동작 전용 오류 문구.
 *
 * 서버 메시지가 영문이라(예: "You are already friends.") 그대로 보여줄 수 없다.
 * 상태 코드마다 무엇이 어긋났는지와 다음에 무엇이 일어나는지(목록 갱신)를 함께 알린다.
 */
function describeFriendError(error: unknown, fallback: string): string {
  if (axios.isAxiosError(error)) {
    switch (error.response?.status) {
      case 403:
        return '친구 관계가 아니어서 처리할 수 없습니다. 목록을 새로 불러왔습니다.';
      case 404:
        return '이미 삭제된 회원이거나 요청입니다.';
      case 409:
        return '이미 처리된 요청입니다. 목록을 새로 불러왔습니다.';
    }
  }
  return getApiErrorMessage(error, fallback);
}
