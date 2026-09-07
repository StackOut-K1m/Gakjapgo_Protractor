// 1:1 DM 타입 — 백엔드 domain/dm(DmDtos)과 1:1 대응.
//
// DM 은 ACCEPTED 친구끼리만 쓸 수 있고, 두 회원 쌍에 방이 하나만 존재한다.
// 친구를 삭제하면 방·메시지는 DB 에 남지만 조회·전송이 모두 막힌다(403).

import type { PageMeta } from '@/types/page';

/** POST /dms · GET /dms 응답 항목. memberId·nickname 은 언제나 <b>상대</b>의 것이다. */
export interface DmRoom {
  roomId: number;
  memberId: number;
  nickname: string;
  profileImageUrl: string | null;
  /** 마지막 대화. 아직 아무 말도 없으면 null */
  lastMessage: string | null;
  lastMessageAt: string | null;
  /**
   * 내가 아직 읽지 않은 메시지 수.
   *
   * ⚠️ <b>서버가 아직 내려주지 않는다</b>(DmDtos.RoomResponse 에 이 필드가 없다). 그래서 값이
   * 없으면 친구 목록의 배지를 그리지 않는다. 화면에서 셀 수도 없다 — 메시지를 받아 세려면
   * 조회를 해야 하고, 그 조회가 곧 읽음 처리이기 때문이다.
   *
   * 백엔드에 요청해 둔 항목이라, 응답에 실리기 시작하면 프론트는 고칠 것이 없다.
   */
  unreadCount?: number;
}

/** 서버가 주는 메시지 한 건 */
export interface DmMessage {
  messageId: number;
  senderMemberId: number;
  content: string;
  sentAt: string;
  /** 상대가 읽은 시각. 아직 안 읽었으면 null */
  readAt: string | null;
}

/**
 * 화면에 그리는 메시지.
 *
 * 보낸 메시지는 서버 왕복을 기다리지 않고 먼저 띄운다(`pending`). 응답이 오면 그 자리를
 * 확정본으로 갈아 끼운다. 기다렸다 띄우면 엔터를 친 뒤 잠깐 아무것도 없는 구간이 생겨
 * 느리게 느껴진다 — 스터디룸 채팅과 같은 방식이다.
 *
 * `messageId` 는 확정 전까지 음수 임시값을 쓴다. 서버 id 와 겹치지 않고, 정렬에서
 * 항상 마지막(가장 최근)에 놓이기 때문이다.
 */
export interface DmMessageView extends DmMessage {
  pending?: boolean;
}

export interface DmMessageListResponse {
  /**
   * <b>오름차순(옛→새)</b>으로 정규화된 목록.
   *
   * 서버는 최신순으로 준다. 뒤집는 일을 화면이 아니라 `dmApi.getDmMessages` 에서 하는 이유는,
   * 나중에 WebSocket 으로 메시지가 한 건씩 들어올 때 끼워 넣을 자리가 분명해야 하기 때문이다.
   * 렌더 시점에 뒤집으면 보관 순서와 표시 순서가 달라 그 자리를 매번 다시 계산해야 한다.
   */
  messages: DmMessage[];
  page: PageMeta;
}

/** 서버 검증값(@Size(max=2000)). 공백만 있는 본문은 거부된다(@NotBlank). */
export const DM_CONTENT_MAX_LENGTH = 2000;

/** 메시지 조회 기본 페이지 크기. 서버 기본값과 같게 두어 첫 페이지 결과가 예측 가능하다. */
export const DM_PAGE_SIZE = 30;
