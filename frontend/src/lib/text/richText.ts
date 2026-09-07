// src/lib/text/richText.ts
//
// 서식 편집기(RichTextEditor)가 저장한 값을 화면에 안전하게 되돌린다.
//
// 방 만들기의 소개글·규칙은 contentEditable 로 입력받아 innerHTML 을 그대로 저장한다.
// 그래서 엔터를 치면 "첫 줄<div>둘째 줄</div><div>셋째 줄</div>" 같은 문자열이 DB 에 들어간다.
// 이걸 글자로 그냥 찍으면 사용자에게 <div> 태그가 보인다 — 실제로 그렇게 보이고 있었다.
//
// dangerouslySetInnerHTML 로 그리는 방법도 있지만 쓰지 않는다. 남이 만든 방의 소개글을
// 그대로 실행하면 스크립트나 추적 픽셀을 심을 수 있고, 편집기에 서식 버튼이 몇 개 없어
// 서식을 살려서 얻는 것도 크지 않다. 줄바꿈만 살리고 나머지는 글자로 만든다.

/*
 * 문단을 나누는 블록 요소. 여는 태그와 닫는 태그 <b>둘 다</b> 줄바꿈으로 바꾼다.
 *
 * 닫는 쪽만 바꾸면 첫 줄이 다음 줄에 붙는다 — "첫줄<div>둘째줄</div>" 이 편집기의
 * 실제 저장 모양이라(첫 줄은 태그 없이 맨 앞에 있다) 여는 태그가 경계 역할을 한다.
 * 빈 줄은 아래에서 걸러지므로 태그마다 두 번 끊겨도 결과는 같다.
 */
const BLOCK_BREAK = /<\/?(?:div|p|li|h[1-6]|blockquote)[^>]*>/gi;
const LINE_BREAK = /<br\s*\/?>/gi;
/** 위에서 줄바꿈으로 바꾸고 남은 태그 전부(<b>, <i> 등). 서식은 버리고 글자만 남긴다. */
const ANY_TAG = /<[^>]*>/g;

/**
 * HTML 엔티티를 실제 글자로 되돌린다.
 *
 * 편집기가 `&`를 `&amp;`로, `<`를 `&lt;`로 저장하므로 그대로 두면 화면에 그 코드가 보인다.
 * DOMParser 를 쓰지 않는 이유는 이 함수가 태그를 이미 다 걷어낸 뒤라 실행 위험이 없고,
 * 자주 나오는 몇 개만 바꾸면 충분해서다.
 */
function decodeEntities(value: string): string {
  return value
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    // & 는 마지막에 바꾼다. 먼저 바꾸면 &amp;lt; 가 < 로 두 번 풀린다.
    .replace(/&amp;/g, '&');
}

/**
 * 서식 문자열을 줄 배열로.
 *
 * 빈 줄은 버린다 — 편집기에서 엔터를 여러 번 치면 빈 `<div>` 가 쌓이는데, 그대로 두면
 * 화면에 정체 모를 여백이 생긴다.
 */
export function toPlainLines(value: string | null | undefined): string[] {
  if (!value) return [];
  return decodeEntities(
    value.replace(BLOCK_BREAK, '\n').replace(LINE_BREAK, '\n').replace(ANY_TAG, ''),
  )
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

/** 서식 문자열을 줄바꿈이 살아 있는 한 덩어리 글로. 화면에서는 white-space 로 줄을 살린다. */
export function toPlainText(value: string | null | undefined): string {
  return toPlainLines(value).join('\n');
}
