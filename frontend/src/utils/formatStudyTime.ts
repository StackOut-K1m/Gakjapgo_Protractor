// src/utils/formatStudyTime.ts

/**
 * 초 단위 공부 시간을 "21h 30m" 형태로 만든다.
 *
 * 서버는 초 단위 원본만 내려준다. 표기는 화면마다 다를 수 있어(시/분, 소수점, 부호) 조립을
 * 프론트가 맡는다.
 *
 * 1시간 미만이면 시간을 빼고 분만 보여 준다. "0h 12m"은 읽는 데 방해만 된다.
 */
export function formatStudyTime(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
}

/**
 * 지난주 대비 증감을 "지난주보다 +3h 10m" 형태로 만든다.
 *
 * 차이가 1분 미만이면 부호와 숫자가 모두 0이라 의미가 없다. 그때는 "지난주와 비슷해요"로
 * 대신한다. 지난주 기록이 아예 없으면(첫 주) 비교할 대상이 없으므로 null 을 돌려준다.
 */
export function formatWeekDiff(
  diffSeconds: number,
  lastWeekSeconds: number,
): string | null {
  if (lastWeekSeconds === 0) return null;

  const magnitude = Math.abs(diffSeconds);
  if (magnitude < 60) return '지난주와 비슷해요';

  const sign = diffSeconds > 0 ? '+' : '-';
  return `지난주보다 ${sign}${formatStudyTime(magnitude)}`;
}
