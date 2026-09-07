/**
 * Date → 'YYYY-MM-DDTHH:mm:ss' (로컬 시각).
 *
 * 서버의 LocalDateTime 은 타임존 오프셋이 없는 형식만 받는다.
 * toISOString() 은 UTC 로 바꾸고 'Z' 를 붙이므로 그대로 보내면 파싱에 실패한다
 * (backend DrowsinessCheckRequest.detectedAt 주석에 같은 함정이 적혀 있다).
 */
/**
 * 목록에 곁들이는 시각. 오늘 것은 시각만, 그 전은 날짜만 보여 준다.
 *
 * 목록은 최신순이라 위쪽이 대개 오늘이다. 거기에 날짜까지 붙이면 같은 날짜가 반복되면서
 * 정작 다른 값(시각)이 눈에 안 들어온다. 형식이 예상과 다르면 원본을 그대로 둔다.
 */
export function formatListTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  const now = new Date();
  const sameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();

  return sameDay
    ? date.toLocaleTimeString('ko-KR', { hour: 'numeric', minute: '2-digit' })
    : `${date.getMonth() + 1}.${date.getDate()}`;
}

export function toLocalDateTimeString(d: Date): string {
  const pad = (n: number) => `${n}`.padStart(2, '0');
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
  );
}
