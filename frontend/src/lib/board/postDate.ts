// src/lib/board/postDate.ts
//
// 홈의 공지·이벤트가 함께 쓰는 날짜 표시.
//
// 두 섹션이 나란히 놓이므로 날짜 모양이 같아야 한다. 한쪽만 "8/4", 다른 쪽만
// "2026.08.04" 로 나오면 같은 줄에서 다른 규칙을 두 번 읽게 된다.

/** 며칠 이내를 "새 글"로 볼지. 주말을 끼고 올라온 글도 월요일에 새 글로 보이게 3일로 둔다. */
export const NEW_POST_DAYS = 3;

/** 이벤트 섹션이 "최근"으로 보는 기간. */
export const RECENT_EVENT_DAYS = 7;

/** 하루(ms). 날짜 계산에 반복해서 쓴다. */
const DAY = 24 * 60 * 60 * 1000;

/**
 * 서버 시각 문자열을 Date 로.
 *
 * 서버는 Asia/Seoul 로 도는데(docker-compose 의 TZ) LocalDateTime 을 표준시 표시 없이
 * 내려준다. 그래서 브라우저가 이 문자열을 제 표준시로 읽어 버리면 최대 하루가 밀린다.
 * 표시가 없을 때만 +09:00 을 붙여 서울 시각으로 못박는다.
 */
function toDate(value: string): Date {
  const hasZone = /(?:Z|[+-]\d{2}:?\d{2})$/.test(value);
  return new Date(hasZone ? value : `${value}+09:00`);
}

/** 지금으로부터 며칠 지났는지. 오늘이면 0. */
export function daysAgo(value: string): number {
  const date = toDate(value);
  if (Number.isNaN(date.getTime())) return Number.POSITIVE_INFINITY;
  return Math.floor((Date.now() - date.getTime()) / DAY);
}

/** 올라온 지 얼마 안 된 글인가. NEW 배지 판단에 쓴다. */
export function isNewPost(value: string): boolean {
  return daysAgo(value) < NEW_POST_DAYS;
}

/**
 * 목록에 찍는 날짜. "8. 4." 처럼 짧게 쓴다.
 *
 * 연도를 넣지 않는 이유는 홈에 걸리는 글이 대부분 최근 것이라서다. 해가 넘어간 글에만
 * 연도를 붙여, 평소에는 짧게 두고 필요할 때만 길어지게 한다.
 */
export function formatPostDate(value: string): string {
  const date = toDate(value);
  if (Number.isNaN(date.getTime())) return '';
  const sameYear = date.getFullYear() === new Date().getFullYear();
  return new Intl.DateTimeFormat('ko-KR', {
    year: sameYear ? undefined : '2-digit',
    month: 'numeric',
    day: 'numeric',
    timeZone: 'Asia/Seoul',
  }).format(date);
}
