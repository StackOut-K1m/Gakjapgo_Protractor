// src/types/friend.ts
// 백엔드 friendship 도메인 DTO (/api/v1/friends) 와 1:1 대응.
//
// 계약: .agents/protractor/Friendship-Frontend-Agent-Prompt.md
//       + Friendship-Frontend-API-Update-20260804.md (받은 요청 목록·friendshipId·알림 정책)
//
// 이름은 백엔드 enum·DTO 와 같은 것을 쓴다(FriendRelationStatus 등). 전역 친구 독과
// 스터디룸 참여자 메뉴가 이 한 벌을 함께 쓴다 — 화면은 둘이지만 계약은 하나다.

import type { PageMeta } from '@/types/page';

/**
 * 나를 기준으로 본 관계. 백엔드 FriendRelationStatus 와 이름·값이 같다.
 *
 * - `NONE`     아무 사이도 아님 → 신청할 수 있다
 * - `OUTGOING` 내가 신청해 두고 답을 기다리는 중 → 표시만 하고 누를 것이 없다(취소 API 없음)
 * - `INCOMING` 상대가 나에게 신청함 → 수락·거절할 수 있다(`friendshipId` 사용)
 * - `ACCEPTED` 친구 → 프로필·DM·해제
 *
 * 거절되거나 차단 이력이 있는 관계도 서버는 `NONE` 으로 내려준다(다시 신청할 수 있으므로).
 * 그래서 화면은 그 둘을 구분하지 않는다 — 서버가 거부하면 그때 오류 문구로 알린다.
 */
export type FriendRelationStatus =
  'NONE' | 'OUTGOING' | 'INCOMING' | 'ACCEPTED';

/**
 * 친구 목록·회원 검색·받은 요청이 <b>모두 같은 항목 형태</b>를 쓴다(서버 FriendResponse).
 * 그래서 목록을 그리는 컴포넌트도 셋이 공유할 수 있다.
 */
export interface FriendItem {
  memberId: number;
  nickname: string;
  profileImageUrl: string | null;
  /**
   * 관계 행의 id. 수락·거절은 memberId 가 아니라 이 값으로 부른다.
   *
   * `relationshipStatus` 가 `NONE` 이면 관계 행 자체가 없어서 <b>항상 null</b> 이다.
   * 그 상태에서는 이 값을 쓰는 동작이 없으므로 읽지 않는다(canRespondToRequest 로 걸러낸다).
   */
  friendshipId: number | null;
  relationshipStatus: FriendRelationStatus;
  requestedAt: string | null;
  respondedAt: string | null;
}

/** GET /friends · /friends/search · /friends/requests 공통 응답 */
export interface FriendListPage {
  friends: FriendItem[];
  page: PageMeta;
}

/**
 * 신청·수락·거절의 응답 (백엔드 FriendRequestResponse).
 *
 * `requestId` 는 다른 API 가 `friendshipId` 라고 부르는 값과 같다 — 서버 필드명만 다르다.
 * `status` 는 관계 행의 상태이므로, 신청했는데 `ACCEPTED` 가 돌아올 수 있다. 상대가 이미
 * 나에게 신청해 둔 경우 서버가 새 행을 만들지 않고 바로 친구로 잇기 때문이다.
 */
export interface FriendRequestResult {
  requestId: number;
  status: 'PENDING' | 'ACCEPTED' | 'REJECTED';
  respondedAt: string | null;
}

/** 친구 프로필의 학습 요약. 시간은 초 단위라 화면에서 형식을 만든다. */
export interface FriendStudySummary {
  totalFocusedSeconds: number;
  recent7DaysFocusedSeconds: number;
  streakDays: number;
}

/**
 * GET /friends/{memberId}/profile — 수락된 친구만 조회할 수 있다(아니면 403).
 *
 * 남의 이메일·캘린더·리포트는 응답에 없다. 내 마이페이지와 같은 화면을 만들 수 없고,
 * 만들 이유도 없다 — 프로필은 이 다섯 값만 쓰는 압축 카드로 그린다.
 */
export interface FriendProfile {
  memberId: number;
  nickname: string;
  profileImageUrl: string | null;
  joinedAt: string;
  studySummary: FriendStudySummary;
}
