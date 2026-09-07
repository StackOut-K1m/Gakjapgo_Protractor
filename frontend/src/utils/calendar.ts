// src/utils/calendar.ts
//
// 월 단위 달력 격자를 만든다. 날짜 문자열 변환은 week.ts 것을 그대로 쓴다 —
// toISOString() 은 UTC 라 KST 오전에 하루 밀리는데, 그 함정은 거기서 이미 처리해 두었다.
import { toDateString } from '@/utils/week';

export const WEEKDAY_LABELS = ['일', '월', '화', '수', '목', '금', '토'];

export interface CalendarCell {
  /** YYYY-MM-DD */
  date: string;
  day: number;
  /** 보고 있는 달에 속하는가. 앞뒤 달 날짜는 흐리게 그린다 */
  inMonth: boolean;
  isToday: boolean;
  /** 0=일 … 6=토 */
  weekday: number;
}

/**
 * 그 달의 달력 격자를 만든다. 앞뒤로 빈칸 대신 이웃 달 날짜를 채운다.
 *
 * <p>빈칸으로 두지 않는 이유는 월말·월초 일정이 화면에서 끊겨 보이기 때문이다. 8월 1일이
 * 토요일이면 첫 줄이 거의 비는데, 7월 마지막 주 일정이 안 보이면 "이번 주"를 한눈에 볼 수 없다.
 *
 * <p>줄 수는 6주로 고정한다. 달마다 5줄·6줄이 오가면 달을 넘길 때 화면 높이가 출렁인다.
 */
export function buildMonthGrid(year: number, month: number): CalendarCell[] {
  const today = toDateString(new Date());
  // month 는 1~12. Date 는 0~11 이라 -1 한다.
  const first = new Date(year, month - 1, 1);
  // 그 달 1일이 속한 주의 일요일부터 시작한다.
  const start = new Date(first);
  start.setDate(1 - first.getDay());

  const cells: CalendarCell[] = [];
  for (let i = 0; i < 42; i += 1) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    const date = toDateString(d);
    cells.push({
      date,
      day: d.getDate(),
      inMonth: d.getMonth() === month - 1 && d.getFullYear() === year,
      isToday: date === today,
      weekday: d.getDay(),
    });
  }
  return cells;
}

/** 한 달 앞뒤로 옮긴 연·월. 12월 다음이 이듬해 1월이 되도록 Date 에 맡긴다. */
export function shiftMonth(
  year: number,
  month: number,
  delta: number,
): { year: number; month: number } {
  const d = new Date(year, month - 1 + delta, 1);
  return { year: d.getFullYear(), month: d.getMonth() + 1 };
}

/**
 * 오늘 기준 남은 일수. 오늘이면 0, 지난 날짜면 음수.
 *
 * 시각을 자정으로 맞춰 뺀다. 지금 시각끼리 빼면 오후에 조회했을 때 내일이 D-0 으로 나온다.
 */
export function daysUntil(targetDate: string, today: Date = new Date()): number {
  const [y, m, d] = targetDate.split('-').map(Number);
  const target = new Date(y, m - 1, d).getTime();
  const base = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  return Math.round((target - base) / 86_400_000);
}

/** D-day 배지 문구. 'D-3' / 'D-DAY' / 'D+2' */
export function formatDDay(targetDate: string, today: Date = new Date()): string {
  const diff = daysUntil(targetDate, today);
  if (diff === 0) return 'D-DAY';
  return diff > 0 ? `D-${diff}` : `D+${-diff}`;
}
