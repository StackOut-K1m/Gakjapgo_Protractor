// 일정(캘린더) 관련 공용 타입 (API 명세서 v3 · 일정 도메인)
//
// backend domain/schedule 의 ScheduleResponse / ScheduleCreateRequest /
// ScheduleUpdateRequest 와 1:1 대응한다. 필드를 바꾸면 서버 DTO도 같이 바꿔야 한다.

/** 일정 하나. targetDate 는 서버가 LocalDate 로 다루므로 시간 성분이 없다. */
export interface Schedule {
  scheduleId: number;
  title: string;
  targetDate: string; // YYYY-MM-DD
  color?: string;
  /** 켜면 홈·캘린더에 D-day 배지가 붙는다 */
  dDayEnabled: boolean;
  memo?: string;
  createdAt: string;
  updatedAt?: string;
}

/** GET /schedules 응답. 어느 달의 응답인지 확인할 수 있게 연·월을 같이 준다. */
export interface ScheduleListResponse {
  year: number;
  month: number;
  schedules: Schedule[];
}

/** POST /schedules 요청 */
export interface ScheduleCreateRequest {
  title: string;
  targetDate: string;
  color?: string;
  dDayEnabled?: boolean;
  memo?: string;
}

/** PATCH /schedules/{id} 요청. 보낸 필드만 반영된다(부분 수정). */
export type ScheduleUpdateRequest = Partial<ScheduleCreateRequest>;

/**
 * 일정에 쓸 수 있는 색.
 *
 * 자유 입력 대신 목록으로 고정한다. 사용자가 배경과 구분되지 않는 색을 고르면 캘린더에서
 * 점이 보이지 않고, 그건 고르는 순간에는 알 수 없다. 서버는 20자 이하면 무엇이든 받는다.
 */
export const SCHEDULE_COLORS = [
  '#4f46e5',
  '#0ea5e9',
  '#16a34a',
  '#f59e0b',
  '#f04438',
  '#a855f7',
] as const;

export const DEFAULT_SCHEDULE_COLOR = SCHEDULE_COLORS[0];
