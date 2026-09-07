// src/utils/voiceGuidance.ts
//
// 음성 안내를 켤지 말지를 기억한다.
//
// ⚠️ 이 값은 **방이 아니라 브라우저**에 붙는다. 방 만들기에서 고른 값이 서버에 저장되지
// 않기 때문이다(study_rooms 에 컬럼이 없다 — docs/backend/voice-guidance.md 참고).
// 그래서 지금은 이렇게 동작한다:
//
//   - 방을 만들며 고른 값 → 이 사람의 기본값이 된다. 그 방에 들어가면 고른 대로 시작한다.
//   - 스터디방에서 토글로 바꾼 값 → 같은 자리에 덮어써서 다음 입장에도 이어진다.
//   - 다른 참여자에게는 전달되지 않는다. 각자 자기 기본값으로 시작한다.
//
// 컬럼이 생기면 "방의 기본값"을 서버에서 읽고 이 값은 사용자가 방 안에서 바꾼 것만
// 담게 바꾸면 된다.
//
// sessionStorage 가 아니라 localStorage 인 이유는, 스터디룸이 별도 팝업 창이고 팝업은
// 창 이름이 재사용될 때 sessionStorage 가 복사되지 않아서다(utils/roomPassword 주석 참고).

const KEY = 'gakjapgo:voice-guidance';

/**
 * 기본값은 켜짐이다.
 *
 * 자세 경고는 화면을 보고 있지 않을 때 놓치기 쉬운데 — 작은 창까지 만든 이유가 그것이다 —
 * 기본을 꺼짐으로 두면 이 기능이 있다는 것 자체를 모른 채 쓰게 된다. 방 만들기 화면과
 * 스터디방 양쪽에 끄는 스위치가 있다.
 */
const DEFAULT_ENABLED = true;

export function readVoiceGuidance(): boolean {
  try {
    const raw = localStorage.getItem(KEY);
    return raw === null ? DEFAULT_ENABLED : raw === 'true';
  } catch {
    // 사생활 보호 모드 등에서 접근이 막힐 수 있다. 그때는 기본값으로 동작한다.
    return DEFAULT_ENABLED;
  }
}

export function writeVoiceGuidance(enabled: boolean): void {
  try {
    localStorage.setItem(KEY, String(enabled));
  } catch {
    // 저장만 안 될 뿐 이번 세션 동작에는 영향이 없다.
  }
}
