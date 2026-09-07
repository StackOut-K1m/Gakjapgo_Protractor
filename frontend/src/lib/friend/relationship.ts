// 관계 상태에서 "무슨 버튼을 그릴지"를 정하는 한 곳.
//
// 이 판단이 여러 화면에 흩어지면(검색 결과 행·참여자 메뉴·프로필 카드) 상태가 하나 늘거나
// 라벨이 바뀔 때마다 세 곳을 같이 고쳐야 하고, 한 곳을 놓치면 그 화면만 옛 규칙으로 남는다.

import type { FriendItem, FriendRelationStatus } from '@/types/friend';

/** 화면이 실제로 실행하는 동작. 처리는 각 화면이 맡고, 여기서는 무엇이 가능한지만 정한다. */
export type FriendAction =
  'request' | 'accept' | 'reject' | 'remove' | 'profile' | 'dm';

export const FRIEND_ACTION_LABEL: Record<FriendAction, string> = {
  request: '친구 신청',
  accept: '수락',
  reject: '거절',
  remove: '친구 삭제',
  profile: '프로필 조회',
  dm: 'DM 전송',
};

export interface RelationshipView {
  /** 지금 누를 수 있는 동작. 비어 있으면 아래 `stateLabel` 만 보여준다. */
  actions: FriendAction[];
  /** 누를 것이 없을 때 대신 보여줄 상태 문구. 없으면 null */
  stateLabel: string | null;
}

/**
 * 회원 검색 결과 한 줄에 그릴 것.
 *
 * `OUTGOING` 에 버튼이 없는 이유는 신청 취소 API 가 아직 없기 때문이다. 취소처럼 보이는
 * 버튼을 두면 눌러도 아무 일이 없어서, 상태 문구만 보여준다.
 * `ACCEPTED` 도 여기서는 문구만이다 — 프로필·DM·삭제는 친구 목록 쪽에서 한다.
 */
export function searchRowView(status: FriendRelationStatus): RelationshipView {
  switch (status) {
    case 'NONE':
      return { actions: ['request'], stateLabel: null };
    case 'INCOMING':
      return { actions: ['accept', 'reject'], stateLabel: null };
    case 'OUTGOING':
      return { actions: [], stateLabel: '신청 대기 중' };
    case 'ACCEPTED':
      return { actions: [], stateLabel: '친구' };
  }
}

/**
 * 친구 목록 아이템의 팝오버 메뉴에 넣을 동작.
 *
 * 이 목록은 `ACCEPTED` 만 담고 있으므로 신청·수락은 나오지 않는다.
 * 순서가 곧 메뉴 순서다 — 프로필을 맨 위에 두어 실수로 삭제를 누르기 어렵게 한다.
 */
export const FRIEND_MENU_ACTIONS: FriendAction[] = ['profile', 'dm', 'remove'];

/** 삭제 확인 문구. 지난 DM 을 못 보게 된다는 사실까지 알려야 되돌릴 수 없음이 전해진다. */
export function removeFriendConfirmMessage(nickname: string): string {
  return `'${nickname}' 님을 친구 목록에서 삭제할까요? 주고받은 DM을 더 이상 볼 수 없습니다.`;
}

/**
 * 신청 결과 안내 문구.
 *
 * 상대가 이미 나에게 신청해 둔 상태였다면 서버가 바로 친구로 잇는다. 그때 "신청했습니다"라고
 * 하면 사용자는 상대의 수락을 기다리게 되는데, 실제로는 이미 친구다.
 */
export function requestResultMessage(status: 'PENDING' | 'ACCEPTED'): string {
  return status === 'ACCEPTED'
    ? '서로 신청해 바로 친구가 되었습니다.'
    : '친구 신청을 보냈습니다.';
}

/** 로컬 필터 — 패널 검색창은 서버를 부르지 않고 받아 둔 목록만 거른다. */
export function filterByNickname(
  friends: FriendItem[],
  keyword: string,
): FriendItem[] {
  const needle = keyword.trim().toLowerCase();
  if (!needle) return friends;
  return friends.filter((f) => f.nickname.toLowerCase().includes(needle));
}
