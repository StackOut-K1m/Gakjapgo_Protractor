// src/lib/text/linkify.ts
//
// 채팅 본문에서 URL 을 찾아 조각으로 나눈다.
//
// HTML 문자열을 만들어 넘기지 않고 조각 배열을 돌려주는 이유는, 채팅 본문이 다른 사용자가
// 쓴 값이기 때문이다. dangerouslySetInnerHTML 로 붙이면 남이 보낸 태그가 그대로 실행된다.
// 조각으로 나눠 React 가 렌더하게 두면 본문은 항상 텍스트로만 들어간다.

/** 링크로 감쌀 조각과 그대로 둘 조각. */
export type TextSegment =
  | { type: 'text'; value: string }
  | { type: 'link'; value: string; href: string };

/**
 * http(s):// 로 시작하거나 www. 로 시작하는 덩어리.
 *
 * - 앞에 글자·@·. 가 붙어 있으면 건너뛴다. 메일 주소(a@www.x.com)나 단어 중간을 잡지 않는다.
 * - http/https/www 로만 시작할 수 있어서 javascript: 같은 스킴은 애초에 걸리지 않는다.
 * - 한글은 도메인에서만 막고 경로·쿼리에서는 허용한다. 도메인에서 막는 이유는
 *   "https://naver.com입니다" 처럼 조사를 붙여 쓰는 경우가 흔해서고, 경로·쿼리에서 허용하는
 *   이유는 주소창에서 복사한 검색 링크에 한글이 그대로 들어 있기 때문이다
 *   (https://search.naver.com/search.naver?query=각잡고). 둘 다 막으면 링크가 중간에 잘린다.
 * - 그래서 "https://naver.com/뉴스입니다" 처럼 경로 뒤에 붙인 조사는 링크에 딸려 들어간다.
 *   도메인 뒤 조사가 훨씬 흔해서 이쪽을 택했다.
 */
const URL_PATTERN =
  /(?<![\w@.])(?:https?:\/\/|www\.)[^\s<>"'/?가-힣㄰-㆏]+(?:[/?][^\s<>"']*)?/gi;

/** 문장 끝 부호. URL 뒤에 바로 붙어 있으면 주소가 아니라 문장의 일부로 본다. */
const TRAILING_PUNCTUATION = /[.,;:!?]+$/;

function occurrences(text: string, char: string): number {
  let count = 0;
  for (const c of text) if (c === char) count += 1;
  return count;
}

/**
 * "링크 보낼게 https://naver.com." 의 마지막 마침표처럼, 주소가 아닌 꼬리를 떼어 낸다.
 * 괄호는 짝이 맞을 때만 남긴다 — "(https://naver.com)" 의 닫는 괄호는 주소가 아니다.
 */
function trimTrailingPunctuation(raw: string): string {
  let url = raw.replace(TRAILING_PUNCTUATION, '');

  while (url.endsWith(')') && occurrences(url, ')') > occurrences(url, '(')) {
    url = url.slice(0, -1).replace(TRAILING_PUNCTUATION, '');
  }

  return url;
}

/**
 * 본문을 텍스트·링크 조각으로 나눈다. 링크가 없으면 통째로 텍스트 조각 하나가 나온다.
 */
export function splitByLinks(text: string): TextSegment[] {
  const segments: TextSegment[] = [];
  let lastIndex = 0;

  // 모듈 수준 정규식이라 이전 호출의 위치가 남아 있다. 매번 처음부터 훑게 되돌린다.
  URL_PATTERN.lastIndex = 0;

  let match: RegExpExecArray | null;
  while ((match = URL_PATTERN.exec(text)) !== null) {
    const url = trimTrailingPunctuation(match[0]);
    // 부호를 떼고 나니 남는 게 없으면 링크로 보지 않는다.
    if (!url) continue;

    if (match.index > lastIndex) {
      segments.push({
        type: 'text',
        value: text.slice(lastIndex, match.index),
      });
    }

    segments.push({
      type: 'link',
      value: url,
      // www. 로 시작하는 주소는 스킴이 없으면 상대 경로로 열린다.
      href: url.toLowerCase().startsWith('www.') ? `https://${url}` : url,
    });

    lastIndex = match.index + url.length;
    // 떼어 낸 문장 부호부터 다시 훑는다. 안 그러면 그 부분이 통째로 사라진다.
    URL_PATTERN.lastIndex = lastIndex;
  }

  if (lastIndex < text.length) {
    segments.push({ type: 'text', value: text.slice(lastIndex) });
  }

  return segments;
}
