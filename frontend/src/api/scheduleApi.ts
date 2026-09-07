import { api } from '@/api/client';
import type {
  Schedule,
  ScheduleCreateRequest,
  ScheduleListResponse,
  ScheduleUpdateRequest,
} from '@/types/schedule';

// 목 데이터를 걷어냈다. backend domain/schedule 이 네 엔드포인트를 모두 구현하고 있어 더 쓸
// 이유가 없고, 남겨 두면 VITE_USE_MOCK 를 끄지 않은 사람에게 가짜 일정이 보인다.
// (다른 API 의 VITE_USE_MOCK 는 아직 서버가 없어서 그대로 둔다)

/** GET /schedules — 특정 연·월의 일정 목록 */
export async function getSchedules(
  year: number,
  month: number,
): Promise<Schedule[]> {
  const { data } = await api.get<ScheduleListResponse>('/schedules', {
    params: { year, month },
  });
  return data.schedules;
}

/**
 * GET /schedules/upcoming — D-day 를 켠 일정 중 오늘 이후 것을 가까운 순으로.
 *
 * 월 단위 조회로 대신할 수 없다. 홈 카드가 보여줄 "가장 가까운 하나"가 몇 달 뒤일 수도 있어서
 * 그때마다 달을 몇 개씩 훑어야 한다.
 */
export async function getUpcomingSchedules(limit?: number): Promise<Schedule[]> {
  const { data } = await api.get<Schedule[]>('/schedules/upcoming', {
    params: limit === undefined ? undefined : { limit },
  });
  return data;
}

/** POST /schedules — 일정 등록 */
export async function createSchedule(
  body: ScheduleCreateRequest,
): Promise<Schedule> {
  const { data } = await api.post<Schedule>('/schedules', body);
  return data;
}

/** PATCH /schedules/{id} — 부분 수정. 바뀐 필드만 보낸다 */
export async function updateSchedule(
  scheduleId: number,
  body: ScheduleUpdateRequest,
): Promise<Schedule> {
  const { data } = await api.patch<Schedule>(`/schedules/${scheduleId}`, body);
  return data;
}

/** DELETE /schedules/{id} */
export async function deleteSchedule(scheduleId: number): Promise<void> {
  await api.delete(`/schedules/${scheduleId}`);
}
