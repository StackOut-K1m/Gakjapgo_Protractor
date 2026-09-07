// DM API — POST/GET /dms, POST/GET /dms/{roomId}/messages.
// ACCEPTED 친구끼리만 쓸 수 있다. 관계가 끊기면 이 아래 모든 호출이 403 이 된다.

import { api } from '@/api/client';
import { DM_PAGE_SIZE } from '@/types/dm';
import type { DmMessage, DmMessageListResponse, DmRoom } from '@/types/dm';

/**
 * DM 방을 열거나 이미 있는 방을 받아 온다.
 *
 * 두 회원 쌍에 방은 하나뿐이라, 같은 사람에게 여러 번 불러도 같은 `roomId` 가 온다.
 * 그래서 "새 대화 시작"과 "지난 대화 열기"를 화면에서 구분할 필요가 없다.
 */
export async function openDmRoom(memberId: number): Promise<DmRoom> {
  const { data } = await api.post<DmRoom>('/dms', { memberId });
  return data;
}

/**
 * 내 DM 방 목록. <b>지금도 친구인 상대의 방만</b> 내려온다.
 *
 * 친구를 삭제한 뒤에는 그 방이 목록에서 사라진다 — 지난 대화를 계속 보여주면 안 된다.
 */
export async function getDmRooms(): Promise<DmRoom[]> {
  const { data } = await api.get<DmRoom[]>('/dms');
  return data;
}

/**
 * 방의 메시지. <b>서버는 최신순으로 주고, 이 함수가 오름차순(옛→새)으로 뒤집어 돌려준다.</b>
 *
 * 뒤집는 자리를 여기로 정한 이유는 보관 순서와 표시 순서를 같게 두려는 것이다. 나중에
 * WebSocket 으로 한 건씩 들어올 때 목록 끝에 붙이면 되고, 렌더에서 매번 뒤집을 필요도 없다.
 *
 * ⚠️ <b>이 호출은 읽음 처리를 겸한다</b> — 상대가 보낸 안 읽은 메시지의 `readAt` 이 채워진다.
 * 그래서 사용자가 보고 있지 않을 때 부르면 안 된다(최소화된 창·숨겨진 탭). 안 읽은 메시지가
 * 조용히 읽음으로 바뀌고 상대에게 읽음 표시가 간다.
 *
 * `page` 를 1 이상으로 주면 <b>더 오래된</b> 묶음이 온다. 그 결과는 기존 목록 앞에 붙인다.
 */
export async function getDmMessages(
  roomId: number,
  page = 0,
  size = DM_PAGE_SIZE,
): Promise<DmMessageListResponse> {
  const { data } = await api.get<DmMessageListResponse>(
    `/dms/${roomId}/messages`,
    { params: { page, size } },
  );
  // 원본을 뒤집지 않도록 복사해서 뒤집는다(같은 배열을 두 번 뒤집는 실수를 막는다).
  return { ...data, messages: [...data.messages].reverse() };
}

/**
 * 이 방에서 받은 안 읽은 메시지를 읽음 처리한다(204).
 *
 * WebSocket 으로 메시지를 받으면 목록을 조회하지 않으므로, 조회에 딸려 오던 읽음 처리가
 * 일어나지 않는다. 그때 이 API 로 대신한다 — <b>사용자가 보고 있을 때만</b> 부른다.
 *
 * 친구가 아니면 403, 방 참여자가 아니면 404 다.
 */
export async function markDmRoomRead(roomId: number): Promise<void> {
  await api.patch(`/dms/${roomId}/read`);
}

/**
 * 메시지 전송. 응답에 확정된 `messageId`·`sentAt` 이 들어 있어 화면의 임시 항목을 갈아 끼울 수 있다.
 *
 * 본문은 공백을 제외해 1~2000자여야 한다(서버 검증). 호출부에서 `trim()` 한 값을 넘긴다.
 */
export async function sendDmMessage(
  roomId: number,
  content: string,
): Promise<DmMessage> {
  const { data } = await api.post<DmMessage>(`/dms/${roomId}/messages`, {
    content,
  });
  return data;
}
