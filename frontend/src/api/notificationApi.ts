// 인앱 알림 API — GET /notifications, PATCH /notifications/{id}/read.
//
// 수신 설정(GET/PATCH /members/me/notification-settings)은 마이페이지가 이미 쓰고 있어
// mypageApi.ts 에 있다. 같은 함수를 여기 또 만들지 않는다.

import { api } from '@/api/client';
import type { NotificationListResponse } from '@/types/notification';

/** 종 드롭다운에 한 번에 보여줄 개수. 더 필요하면 page 를 올려 받는다. */
export const NOTIFICATION_PAGE_SIZE = 10;

/** 내 알림 목록(최신순). `unreadOnly` 로 안 읽은 것만 받을 수 있다. */
export async function getNotifications(
  options: { unreadOnly?: boolean; page?: number; size?: number } = {},
): Promise<NotificationListResponse> {
  const {
    unreadOnly = false,
    page = 0,
    size = NOTIFICATION_PAGE_SIZE,
  } = options;
  const { data } = await api.get<NotificationListResponse>('/notifications', {
    params: { unreadOnly, page, size },
  });
  return data;
}

/**
 * 안 읽은 알림 개수. 종 아이콘 배지에 쓴다.
 *
 * 개수 전용 API 는 없다. 목록을 `size=1` 로 받아 `page.totalElements` 만 읽는 것이
 * 백엔드와 합의된 방식이다(항목 하나만 실려 오므로 응답도 가볍다).
 */
export async function getUnreadNotificationCount(): Promise<number> {
  const { page } = await getNotifications({ unreadOnly: true, size: 1 });
  return page.totalElements;
}

/** 읽음 처리. 이미 읽은 알림은 처음 읽은 시각을 그대로 둔다(서버가 처리). */
export async function readNotification(notificationId: number): Promise<void> {
  await api.patch(`/notifications/${notificationId}/read`);
}

/**
 * 안 읽은 알림을 모두 읽음 처리한다. 응답 본문이 없으므로(204) 호출부가 목록·개수를 다시 받는다.
 *
 * 예전에는 개별 PATCH 만 있어서 20건이면 요청이 20번 나갔다 — 그래서 이 버튼을 두지
 * 않았는데, 서버가 일괄 API 를 내주면서 그 제약이 사라졌다.
 */
export async function markAllNotificationsRead(): Promise<void> {
  await api.patch('/notifications/read-all');
}

/**
 * 읽은 알림을 모두 지운다(204).
 *
 * <b>물리 삭제라 되돌릴 수 없다.</b> 안 읽은 알림은 서버가 항상 보존하므로, 이 동작으로
 * 아직 확인하지 않은 소식이 사라지지는 않는다.
 */
export async function deleteReadNotifications(): Promise<void> {
  await api.delete('/notifications/read');
}
