// src/lib/board/boardDate.ts
//
// 게시판의 작성 시각 표기.
//
// 서버는 UTC 로 준다(2026-08-03T05:23:00Z). 예전에는 이 문자열을 앞에서 잘라 쓰기만 해서
// 화면에 UTC 가 그대로 나왔다 — 오후 2시 23분에 쓴 글이 05:23 으로 보였고, 자정 근처에 쓴
// 글은 날짜까지 하루 어긋났다. 문자열이 아니라 시각으로 해석해서 한국 시간으로 바꾼다.
//
// 표준시를 브라우저 설정이 아니라 Asia/Seoul 로 못 박는 이유는, 해외에서 접속한 사람과
// 국내 사용자가 같은 글에 다른 시각을 보면 댓글로 시간을 이야기할 때 어긋나기 때문이다.
const TIME_ZONE = 'Asia/Seoul';

/**
 * 서버가 준 시각 문자열을 실제 시각으로 바꾼다.
 *
 * 서버는 "2026-08-03T11:59:34" 처럼 표준시 표기 없이 보낸다. 이 값은 서버가 도는 표준시
 * (Asia/Seoul)의 시각이다. 그런데 자바스크립트는 표기가 없는 문자열을 규칙상 "보는 사람의
 * 로컬 시각"으로 읽는다. 한국에서 보면 우연히 맞지만, 다른 표준시에서 보면 어긋난다.
 *
 * 그래서 표기가 없을 때만 +09:00 을 붙여 어느 시각인지 못 박는다. 표기가 이미 있으면
 * (Z 든 오프셋이든) 그대로 둔다.
 *
 * 서버가 오프셋을 붙여 주는 것이 본래 맞다. 다만 그 설정은 이 앱의 모든 API 응답에 걸리는
 * 전역 설정이라, 게시판 화면 하나 고치자고 다른 담당 영역까지 바꿀 수는 없어 여기서 받는다.
 * 그때가 오면 이 보정은 지워도 된다 — 표기가 있으면 건드리지 않기 때문이다.
 */
const SERVER_OFFSET = '+09:00';

function toDate(iso: string): Date {
  const hasZone = /(?:Z|[+-]\d{2}:?\d{2})$/.test(iso);
  return new Date(hasZone ? iso : `${iso}${SERVER_OFFSET}`);
}

const DATE_ONLY = new Intl.DateTimeFormat('ko-KR', {
  timeZone: TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

const DATE_TIME = new Intl.DateTimeFormat('ko-KR', {
  timeZone: TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

/** ko-KR 는 "2026. 08. 03." 처럼 준다. 게시판 표기에 맞춰 "2026.08.03" 으로 다듬는다. */
function tidy(text: string): string {
  return text.replace(/\.\s*/g, '.').replace(/\.$/, '');
}

/** 목록용 — 2026.08.03 */
export function formatBoardDate(iso: string): string {
  const date = toDate(iso);
  // 서버가 예상 못 한 형식을 주면 화면이 "Invalid Date" 로 깨진다. 그때는 원본을 그대로 둔다.
  if (Number.isNaN(date.getTime())) return iso;
  return tidy(DATE_ONLY.format(date));
}

/** 상세·댓글용 — 2026.08.03 14:23 */
export function formatBoardDateTime(iso: string): string {
  const date = toDate(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return tidy(DATE_TIME.format(date)).replace(/\.(\d{2}:\d{2})$/, ' $1');
}
