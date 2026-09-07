// src/utils/mediaToggles.ts
//
// 마이크·카메라를 켤지 말지를 기억한다.
//
// 새로고침하면 화면 상태가 전부 처음 값으로 돌아가는데, 이 둘만은 그러면 안 된다.
// 카메라를 끄고 공부하던 사람이 새로고침 한 번에 얼굴이 다시 켜지기 때문이다.
//
// 화면공유와 작은 창(PiP)은 일부러 기억하지 않는다. 새로고침하면 브라우저가 그 창을 닫고
// 화면 캡처 권한도 놓아 주므로, 상태만 되살리면 버튼은 켜져 있는데 실제로는 꺼져 있는
// 상태가 된다. 화면공유는 사용자 제스처 없이 다시 시작할 수도 없다.
//
// 부위별 감지 카운트(useRoomEntryStore)와 보관 장소가 다른 이유:
//   - 감지 카운트 = 그 방 그 세션에서만 뜻이 있는 값. 어기면 안 되니 세션 스토어에 둔다.
//   - 마이크·카메라 = 기기에 붙는 내 취향. 방이 바뀌어도 이어지는 게 자연스럽다.
// 그래서 음성 안내(utils/voiceGuidance)와 같은 자리에 같은 방식으로 둔다.
//
// sessionStorage 가 아니라 localStorage 인 이유는, 스터디룸이 별도 팝업 창이고 팝업은
// 창 이름이 재사용될 때 sessionStorage 가 복사되지 않아서다(utils/roomPassword 주석 참고).

const MIC_KEY = 'gakjapgo:mic-on';
const CAMERA_KEY = 'gakjapgo:camera-on';

/** 둘 다 기본은 켜짐이다. 캠스터디라 서로 보이는 것이 전제다. */
const DEFAULT_ON = true;

function read(key: string): boolean {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? DEFAULT_ON : raw === 'true';
  } catch {
    // 사생활 보호 모드 등에서 접근이 막힐 수 있다. 그때는 기본값으로 동작한다.
    return DEFAULT_ON;
  }
}

function write(key: string, on: boolean): void {
  try {
    localStorage.setItem(key, String(on));
  } catch {
    // 저장만 안 될 뿐 이번 세션 동작에는 영향이 없다.
  }
}

export const readMicOn = () => read(MIC_KEY);
export const writeMicOn = (on: boolean) => write(MIC_KEY, on);

export const readCameraOn = () => read(CAMERA_KEY);
export const writeCameraOn = (on: boolean) => write(CAMERA_KEY, on);
