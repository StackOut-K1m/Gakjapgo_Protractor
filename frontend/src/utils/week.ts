// src/utils/week.ts
//
// 주간 리포트는 "이번 주 진행 상황"이 아니라 "지난주 한 주 결산"을 보여준다.
// 그래서 오늘이 무슨 요일이든 범위는 항상 지난주 월요일~일요일 7일로 고정된다.

const WEEKDAY_LABELS = ['일', '월', '화', '수', '목', '금', '토'];

/** Date → 'YYYY-MM-DD'. toISOString() 은 UTC 라 KST 오전에는 하루 밀려서 쓰지 않는다. */
export function toDateString(d: Date): string {
  const month = `${d.getMonth() + 1}`.padStart(2, '0');
  const day = `${d.getDate()}`.padStart(2, '0');
  return `${d.getFullYear()}-${month}-${day}`;
}

/** 'YYYY-MM-DD' → 로컬 자정 Date. new Date('2026-07-20') 은 UTC 로 해석된다. */
export function parseDateString(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(d: Date, days: number): Date {
  const next = new Date(d);
  next.setDate(next.getDate() + days);
  return next;
}

export interface WeekRange {
  /** 그 주 월요일 YYYY-MM-DD */
  start: string;
  /** 그 주 일요일 YYYY-MM-DD */
  end: string;
  /** 월→일 순서의 7일 */
  dates: string[];
}

/** 오늘이 속한 주의 월요일 YYYY-MM-DD */
export function thisWeekStart(today: Date = new Date()): string {
  // getDay() 는 0=일 … 6=토. 주 시작을 월요일로 보므로 일요일은 6일 전이 월요일이다.
  return toDateString(addDays(today, -((today.getDay() + 6) % 7)));
}

/** 지난주 월요일 ~ 일요일. 오늘이 무슨 요일이든 결과는 같은 주를 가리킨다. */
export function lastWeekRange(today: Date = new Date()): WeekRange {
  const offsetToMonday = (today.getDay() + 6) % 7;
  const lastMonday = addDays(today, -offsetToMonday - 7);
  const dates = Array.from({ length: 7 }, (_, i) =>
    toDateString(addDays(lastMonday, i)),
  );
  return { start: dates[0], end: dates[6], dates };
}

/**
 * 이번 주 월요일 ~ 일요일 (진행 중인 주).
 *
 * 피드백 배포 주간에는 지난주 기록이 없는 사용자가 대부분이라, 리포트 화면·생성을
 * 이번 주 기준으로 돌린다. 아직 오지 않은 요일은 집계에 행이 없어 0/기록 없음으로 나온다.
 */
export function thisWeekRange(today: Date = new Date()): WeekRange {
  const offsetToMonday = (today.getDay() + 6) % 7;
  const monday = addDays(today, -offsetToMonday);
  const dates = Array.from({ length: 7 }, (_, i) =>
    toDateString(addDays(monday, i)),
  );
  return { start: dates[0], end: dates[6], dates };
}

/**
 * 월요일 날짜 문자열로 그 주 범위를 만든다. 리포트 화면의 주 이동(◀ 지난주 / 다음 주 ▶)이 쓴다.
 *
 * lastWeekRange·thisWeekRange 처럼 '오늘'을 기준으로 삼지 않는다 — 여러 주를 오가려면
 * 기준이 오늘이 아니라 지금 보고 있는 주여야 한다.
 */
export function weekRangeFrom(mondayStr: string): WeekRange {
  const monday = parseDateString(mondayStr);
  const dates = Array.from({ length: 7 }, (_, i) =>
    toDateString(addDays(monday, i)),
  );
  return { start: dates[0], end: dates[6], dates };
}

/** 보고 있는 주에서 delta 주만큼 옮긴 범위. -1 이면 지난주, +1 이면 다음 주 */
export function shiftWeek(range: WeekRange, delta: number): WeekRange {
  return weekRangeFrom(toDateString(addDays(parseDateString(range.start), delta * 7)));
}

/** '월', '화' … 그래프 X축 라벨 */
export function weekdayLabel(dateStr: string): string {
  return WEEKDAY_LABELS[parseDateString(dateStr).getDay()];
}

/** '7/14' — 리포트 제목의 기간 표기 */
export function formatMonthDay(dateStr: string): string {
  const d = parseDateString(dateStr);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

/** '7/16 월요일 14:20' — 자세 하이라이트 캡션 */
export function formatHighlightTime(iso: string): string {
  const d = new Date(iso);
  const hh = `${d.getHours()}`.padStart(2, '0');
  const mm = `${d.getMinutes()}`.padStart(2, '0');
  return `${d.getMonth() + 1}/${d.getDate()} ${WEEKDAY_LABELS[d.getDay()]}요일 ${hh}:${mm}`;
}
