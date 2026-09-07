// 인앱 알림 타입 — 백엔드 domain/notification 과 1:1 대응.

import type { PageMeta } from '@/types/page';

/**
 * 알림 종류. 서버 NotificationType enum 과 같은 값이다.
 *
 * <b>지금 서버가 만드는 알림은 이 셋뿐이다.</b> 알림 수신 설정(GET /members/me/notification-settings)
 * 에는 커뮤니티·문의·공지·랭킹 항목도 있지만, 그 알림을 저장하는 코드는 아직 없다.
 * 그래서 목록에는 나타나지 않는다.
 *
 * 이번 범위에서 화면이 이동까지 연결하는 것은 `FRIENDSHIP`·`DM` 둘이다.
 * `REPORT` 는 목록에 보여주고 읽음 처리만 한다.
 */
export type NotificationType = 'FRIENDSHIP' | 'DM' | 'REPORT';

/**
 * 알림이 가리키는 대상의 종류. `referenceId` 를 무엇으로 읽어야 하는지 알려 준다.
 *
 * - `FRIENDSHIP` → `referenceId` 는 `friendshipId`
 * - `DM_ROOM`    → `referenceId` 는 DM `roomId`
 *
 * 그 외 값은 계약에 정의돼 있지 않아 좁히지 않는다. 아는 값만 분기하고 나머지는 이동 없이 둔다.
 */
export type ReferenceType = string;

export interface NotificationItem {
  notificationId: number;
  type: NotificationType;
  title: string;
  message: string;
  referenceType: ReferenceType;
  referenceId: number | null;
  /** 읽은 시각. null 이면 아직 안 읽은 알림이다 */
  readAt: string | null;
  createdAt: string;
}

/** GET /notifications — 최신순 */
export interface NotificationListResponse {
  notifications: NotificationItem[];
  page: PageMeta;
}

/**
 * `FRIENDSHIP` 알림은 <b>"친구 신청을 받았다"만</b> 뜻한다.
 *
 * 신청이 수락됐을 때는 서버가 알림을 만들지 않는다(2026-08-04 확정). 두 경우가 같은
 * `type`·`referenceType` 을 쓰던 탓에 제목 문자열로 구분해야 했는데, 수락 알림 자체를
 * 없애서 그 문제를 지웠다. 덕분에 이 타입의 알림은 언제나 '받은 요청' 화면으로 보내면 된다.
 */
export const FRIENDSHIP_REFERENCE_TYPE = 'FRIENDSHIP';

/** DM 알림의 `referenceType`. `referenceId` 가 방 번호다. */
export const DM_ROOM_REFERENCE_TYPE = 'DM_ROOM';
