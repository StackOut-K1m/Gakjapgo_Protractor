// src/api/friendApi.ts
//
// 친구 API (/api/v1/friends). 목 데이터는 두지 않는다 — 백엔드가 엔드포인트를 모두
// 구현하고 있어서 가짜를 쓸 이유가 없다. 토큰 첨부와 401 재시도는 공용 인스턴스가 맡는다.
//
// 전역 친구 독과 스터디룸 참여자 메뉴가 이 한 벌을 함께 쓴다. 화면은 둘로 나뉘지만
// (독은 SPA, 방은 별도 팝업 창) 관계를 바꾸는 동작은 어디서 불러도 같기 때문이다.
import { api } from '@/api/client';
import type {
  FriendItem,
  FriendListPage,
  FriendProfile,
  FriendRequestResult,
} from '@/types/friend';
import { MAX_PAGE_SIZE } from '@/types/page';

/**
 * GET /friends — 수락된 친구 목록(항목의 `relationshipStatus` 는 늘 `ACCEPTED`).
 *
 * 기본 크기를 서버 최대값으로 둔 이유는 친구 패널이 스크롤 목록이고 검색이 로컬 필터이기
 * 때문이다. 페이지를 나눠 받으면 "검색했는데 2페이지에 있는 친구가 안 나오는" 상태가 된다.
 * 100 명을 넘는 사람만 다음 페이지를 이어 받는다.
 */
export async function getFriends(
  page = 0,
  size = MAX_PAGE_SIZE,
): Promise<FriendListPage> {
  const { data } = await api.get<FriendListPage>('/friends', {
    params: { page, size },
  });
  return data;
}

/**
 * GET /friends/search — 닉네임으로 회원을 찾는다. 항목마다 나와의 관계가 실려 온다.
 *
 * 친구가 아닌 사람을 찾는 유일한 경로다. 독 패널 안의 검색창은 이미 받아 둔 친구 목록을
 * 거르는 로컬 필터이므로 이 함수를 쓰지 않는다.
 *
 * 특정 회원 한 명과의 관계를 묻는 엔드포인트가 따로 없어서, 스터디룸처럼 memberId 만
 * 아는 자리에서도 이 검색을 거쳐야 한다(아래 findRelation 참고).
 */
export async function searchMembers(
  keyword: string,
  page = 0,
  size = MAX_PAGE_SIZE,
): Promise<FriendListPage> {
  const { data } = await api.get<FriendListPage>('/friends/search', {
    params: { keyword, page, size },
  });
  return data;
}

/**
 * GET /friends/requests — 내가 받은 친구 신청. 대기 중인 것만 최신 신청순으로 온다.
 *
 * 이 API 가 없던 동안에는 "누가 나에게 신청했는지"를 알 방법이 없었다 — 검색은 닉네임을
 * 알아야 하고, 친구 목록은 수락된 것만 준다. 서버가 정렬해 주므로 화면에서 다시 정렬하지 않는다.
 */
export async function getIncomingRequests(
  page = 0,
  size = MAX_PAGE_SIZE,
): Promise<FriendListPage> {
  const { data } = await api.get<FriendListPage>('/friends/requests', {
    params: { page, size },
  });
  return data;
}

/**
 * 이 회원과 나의 관계를 알아낸다. 못 찾으면 null.
 *
 * <p>
 * 닉네임으로 검색해서 memberId 가 같은 항목을 고른다. 빙 돌아가는 것처럼 보이지만 서버가
 * 주는 유일한 통로다 — GET /friends 는 <b>수락된</b> 친구만 주므로 "내가 신청해 둔
 * 상태(OUTGOING)"나 "상대가 신청한 상태(INCOMING)"를 알 수 없다. 닉네임이 겹쳐 여러 명이
 * 나와도 memberId 로 고르므로 엉뚱한 사람을 집지 않는다.
 *
 * <p>
 * ⚠️ <b>유일한 사용처는 스터디룸 참여자 메뉴다</b> — 방 안에서는 memberId 와 닉네임만 안다.
 * 방 안 상호작용을 접기로 정하면 이 함수도 함께 지운다(계획서의 되돌릴 목록 참고).
 * 관계 조회 엔드포인트(GET /friends/{memberId}/relation 같은)가 생기면 이 함수만 갈아 끼운다.
 */
export async function findRelation(
  memberId: number,
  nickname: string,
): Promise<FriendItem | null> {
  const { friends } = await searchMembers(nickname);
  return friends.find((f) => f.memberId === memberId) ?? null;
}

/**
 * POST /friends/requests — 친구 신청.
 *
 * 응답 `status` 를 반드시 확인해야 한다. 상대도 나에게 신청해 둔 상태였다면 서버가 새 행을
 * 만들지 않고 곧바로 `ACCEPTED` 로 잇는다 — 그때 "신청했습니다"라고 말하면 사실과 다르다.
 *
 * 이미 친구이거나 신청이 중복이면 409, 상대가 없으면 404 다.
 */
export async function requestFriend(
  receiverId: number,
): Promise<FriendRequestResult> {
  const { data } = await api.post<FriendRequestResult>('/friends/requests', {
    receiverId,
  });
  return data;
}

/**
 * POST /friends/requests/{friendshipId}/accept — 받은 신청 수락.
 * `INCOMING` 인 대상의 `friendshipId` 로만 부른다(이미 처리됐으면 409).
 */
export async function acceptFriendRequest(
  friendshipId: number,
): Promise<FriendRequestResult> {
  const { data } = await api.post<FriendRequestResult>(
    `/friends/requests/${friendshipId}/accept`,
  );
  return data;
}

/**
 * POST /friends/requests/{friendshipId}/reject — 받은 신청 거절.
 * 관계 행은 남지만 검색에서는 `NONE` 으로 보여서 다시 신청할 수 있다.
 */
export async function rejectFriendRequest(
  friendshipId: number,
): Promise<FriendRequestResult> {
  const { data } = await api.post<FriendRequestResult>(
    `/friends/requests/${friendshipId}/reject`,
  );
  return data;
}

/**
 * DELETE /friends/{memberId} — 친구 해제. 신청 취소가 아니라 수락된 관계를 끊는 것이고,
 * 관계 행이 실제로 사라진다.
 *
 * 지난 DM 은 DB 에 남지만 이후 조회·전송이 모두 403 이 된다. 그래서 호출부는 열려 있는
 * DM 창을 함께 닫아야 한다 — 남겨 두면 메시지를 쓰는 순간 실패한다.
 */
export async function removeFriend(memberId: number): Promise<void> {
  await api.delete(`/friends/${memberId}`);
}

/**
 * GET /friends/{memberId}/profile — 친구인 상대만 조회할 수 있다(아니면 403/404).
 *
 * 403 은 그 사이 관계가 끊겼다는 뜻이므로, 호출부는 목록을 다시 받고 화면을 닫는다.
 */
export async function getFriendProfile(
  memberId: number,
): Promise<FriendProfile> {
  const { data } = await api.get<FriendProfile>(`/friends/${memberId}/profile`);
  return data;
}

/**
 * 수락·거절을 부를 수 있는 대상인지.
 *
 * `friendshipId` 는 `NONE` 일 때 null 이라, 그 값을 그대로 경로에 넣으면 `/requests/null/accept`
 * 같은 요청이 나간다. 버튼을 그리기 전에 이 함수로 걸러 그런 요청 자체를 만들지 않는다.
 */
export function canRespondToRequest(
  item: FriendItem,
): item is FriendItem & { friendshipId: number } {
  return item.relationshipStatus === 'INCOMING' && item.friendshipId !== null;
}
