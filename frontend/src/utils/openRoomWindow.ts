// src/utils/openRoomWindow.ts

/** 창 이름을 고정하면 이미 열린 스터디룸 창을 재사용한다 */
const ROOM_WINDOW_NAME = 'gakjapgo-study-room';

/** 요청 크기. 화면보다 크면 브라우저가 팝업 대신 탭으로 열어버린다 */
const PREFERRED_WIDTH = 1280;
const PREFERRED_HEIGHT = 860;

/** 창 테두리·작업표시줄 여유 */
const SCREEN_MARGIN = 80;

const LOADING_HTML = `<!DOCTYPE html>
<html lang="ko">
  <head>
    <meta charset="utf-8" />
    <title>각잡고</title>
    <style>
      body {
        margin: 0;
        height: 100vh;
        display: flex;
        align-items: center;
        justify-content: center;
        background: #f2f4f7;
        font-family: 'Noto Sans KR', sans-serif;
        color: #475467;
      }
    </style>
  </head>
  <body>
    <p>스터디룸을 준비하는 중...</p>
  </body>
</html>`;

export function buildPreparationUrl(roomId: string): string {
  return `${window.location.origin}/study/room/${roomId}/preparation`;
}

/**
 * 빈 팝업 창을 즉시 연다.
 * 반드시 클릭 핸들러 안에서 await 이전에 호출해야 팝업 차단을 피한다.
 */
export function openRoomWindow(): Window | null {
  const width = Math.min(
    PREFERRED_WIDTH,
    window.screen.availWidth - SCREEN_MARGIN,
  );
  const height = Math.min(
    PREFERRED_HEIGHT,
    window.screen.availHeight - SCREEN_MARGIN,
  );

  const left = window.screenX + (window.outerWidth - width) / 2;
  const top = window.screenY + (window.outerHeight - height) / 2;

  const features = [
    'popup=yes',
    `width=${Math.round(width)}`,
    `height=${Math.round(height)}`,
    `left=${Math.max(0, Math.round(left))}`,
    `top=${Math.max(0, Math.round(top))}`,
    'menubar=no',
    'toolbar=no',
    'status=no',
    'resizable=yes',
  ].join(',');

  const win = window.open('', ROOM_WINDOW_NAME, features);
  if (!win) {
    // 팝업이 막히면 창이 안 열리고 끝난다. 스터디룸은 이 창에서만 동작하므로 대체 경로가
    // 없는데, 알리지 않으면 사용자는 버튼이 고장 난 것으로만 본다.
    notifyPopupBlocked();
    return null;
  }
  win.document.write(LOADING_HTML);
  win.document.close();
  return win;
}

/**
 * 팝업 차단 안내.
 *
 * 이 안내를 놓치면 방에 들어갈 방법 자체가 없어서, 확인을 누르기 전까지 화면을 막는
 * alert 를 쓴다. 조용한 토스트로는 지나칠 수 있다.
 */
function notifyPopupBlocked(): void {
  window.alert(
    '스터디룸 창이 열리지 않았습니다.\n\n' +
      '브라우저가 팝업을 차단했습니다. 주소창 오른쪽의 차단 아이콘을 눌러 ' +
      '이 사이트의 팝업을 허용한 뒤 다시 시도해 주세요.',
  );
}

/** 이미 roomId를 아는 경우(룸 목록에서 입장 등)는 한 번에 연다 */
export function openRoomWindowAt(roomId: string): Window | null {
  const win = openRoomWindow();
  if (win) {
    win.location.href = buildPreparationUrl(roomId);
    win.focus();
  }
  return win;
}