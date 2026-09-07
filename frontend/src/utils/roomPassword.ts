// src/utils/roomPassword.ts
//
// 비공개 방 비밀번호를 "방을 고른 창"에서 "준비 화면 팝업"으로 넘긴다.
//
// 준비 화면은 별도 팝업이라 입력받은 값을 그대로 쓸 수가 없다. 넘기는 방법을 고르면서
// 나머지를 왜 버렸는지 남겨 둔다.
//
//   - 주소(쿼리스트링): 안 된다. 방문 기록·서버 로그에 남고 화면에도 그대로 보인다.
//   - sessionStorage: 팝업은 창 이름이 고정이라 이미 열려 있으면 재사용되는데,
//     재사용된 창에는 sessionStorage 복사가 일어나지 않는다. 첫 입장은 되고 두 번째는
//     안 되는, 원인을 찾기 어려운 버그가 된다.
//   - postMessage: 동작하지만 팝업이 뜨는 시점을 기다리는 왕복이 필요하다.
//
// 그래서 여는 쪽 창의 메모리에 잠깐 두고, 팝업이 window.opener 로 직접 읽어 간다.
// 같은 출처라 접근이 허용되고, 창을 닫으면 값도 같이 사라진다.

/** 여는 쪽 window 에 붙이는 이름. 다른 스크립트와 겹치지 않게 앱 이름을 붙였다. */
const FIELD = '__gakjapgoRoomPassword';

interface PendingPassword {
  roomId: string;
  password: string;
}

type Carrier = Window & { [FIELD]?: PendingPassword };

/**
 * 팝업을 열기 직전에 부른다.
 *
 * 방 번호를 같이 담는 이유는, 다른 방에 들어갈 때 앞서 입력한 비밀번호가 잘못 딸려 가는 걸
 * 막기 위해서다.
 */
export function stashRoomPassword(roomId: string, password: string): void {
  (window as Carrier)[FIELD] = { roomId, password };
}

/**
 * 준비 화면(팝업)에서 부른다. 없으면 null.
 *
 * 읽고 나서 지우지 않는다. 준비 화면이나 스터디룸을 새로고침하면 입장 API 를 다시 부르는데,
 * 그때 값이 없으면 비밀번호를 다시 물을 방법이 없어 방에서 튕겨 나가기 때문이다.
 * 값은 방을 고른 창이 닫히거나 다른 곳으로 이동하면 자연히 사라진다.
 */
export function readRoomPassword(roomId: string): string | null {
  const carrier = findCarrier();
  if (!carrier) {
    return null;
  }
  const pending = carrier[FIELD];
  return pending && pending.roomId === roomId ? pending.password : null;
}

/**
 * 남은 값을 지운다. 입장을 취소했거나, 서버가 그 비밀번호를 거절했을 때 부른다.
 *
 * 값을 들고 있는 창에서 지워야 한다. 팝업(준비 화면)에서 자기 window 만 지우면 정작 값이 있는
 * 여는 쪽 창은 그대로라, 다음 입장 시도에서 틀린 값이 또 실려 나간다.
 */
export function clearRoomPassword(): void {
  const carrier = findCarrier();
  if (carrier) {
    delete carrier[FIELD];
  }
}

/**
 * 값을 들고 있는 창을 찾는다. 팝업이면 자기를 연 창, 아니면 자기 자신.
 *
 * 다른 출처의 창이면 location 을 읽는 순간 예외가 난다. 그래서 통째로 감싼다 —
 * 여기서 터지면 방에 들어가는 흐름 전체가 멈춘다.
 */
function findCarrier(): Carrier | null {
  const self = window as Carrier;
  if (self[FIELD]) {
    return self;
  }
  try {
    const opener = window.opener as Carrier | null;
    if (!opener || opener.closed) {
      return null;
    }
    return opener.location.origin === window.location.origin ? opener : null;
  } catch {
    return null;
  }
}
