// src/utils/backgroundEffect.ts
//
// 스터디방 화면 설정의 배경 효과를 기억한다.
//
// voiceGuidance 와 같은 이유로 localStorage 를 쓴다 — 스터디룸이 별도 팝업 창이라
// sessionStorage 는 창 이름이 재사용될 때 복사되지 않는다(utils/roomPassword 주석 참고).
//
// 이 값도 브라우저에 붙는다. 서버에 저장하는 자리가 없어서 다른 참여자에게 전달되지
// 않지만, 그래도 상관없다 — 배경을 흐리게 할지는 방의 규칙이 아니라 각자의 사정이다.

/**
 * 배경 효과 종류.
 *
 * 흐림 정도를 두 단계로 나눈 이유는 방 환경 차이가 크기 때문이다. 한 값으로 고정하면
 * 뒤가 벽 하나인 사람에겐 과하고, 사람이 지나다니는 거실에 있는 사람에겐 모자란다.
 */
export type BackgroundEffect = 'off' | 'blur-light' | 'blur-strong';

const KEY = 'gakjapgo:background-effect';

/**
 * 기본값은 꺼짐이다.
 *
 * 음성 안내와 반대다. 배경 효과는 켜는 순간 세그멘테이션 모델이 GPU 에 올라가고 매 프레임
 * 추론이 도는데, 그 자원을 자세 판정과 나눠 쓰게 된다. 원하지 않는 사람에게까지 그 비용을
 * 기본으로 물릴 수는 없다. 게다가 몰라서 못 쓰는 기능도 아니다 — 컨트롤바에 버튼이 보인다.
 */
const DEFAULT_EFFECT: BackgroundEffect = 'off';

/** 화면 설정 메뉴에 그대로 쓰는 이름 */
export const BACKGROUND_EFFECT_LABEL: Record<BackgroundEffect, string> = {
  off: '효과 없음',
  'blur-light': '배경 흐리게 (약)',
  'blur-strong': '배경 흐리게 (강)',
};

/** 메뉴에 놓는 순서 */
export const BACKGROUND_EFFECT_ORDER: BackgroundEffect[] = [
  'off',
  'blur-light',
  'blur-strong',
];

/**
 * 배경에 먹일 흐림 반지름(px). 합성 해상도 640 폭 기준이다.
 *
 * 화면에 보이는 크기가 아니라 합성 캔버스 기준이라는 점이 중요하다. 여기서 정한 값이
 * 타일에서는 확대되어 조금 더 뭉개져 보인다.
 */
export const BACKGROUND_BLUR_RADIUS: Record<BackgroundEffect, number> = {
  off: 0,
  'blur-light': 6,
  'blur-strong': 14,
};

function isBackgroundEffect(value: string): value is BackgroundEffect {
  return value in BACKGROUND_EFFECT_LABEL;
}

export function readBackgroundEffect(): BackgroundEffect {
  try {
    const raw = localStorage.getItem(KEY);
    // 예전 값이나 손으로 고친 값이 들어 있을 수 있다. 모르는 값이면 꺼짐으로 본다 —
    // 알 수 없는 설정 때문에 카메라가 이상하게 보이는 것보다 낫다.
    return raw !== null && isBackgroundEffect(raw) ? raw : DEFAULT_EFFECT;
  } catch {
    // 사생활 보호 모드 등에서 접근이 막힐 수 있다. 그때는 기본값으로 동작한다.
    return DEFAULT_EFFECT;
  }
}

export function writeBackgroundEffect(effect: BackgroundEffect): void {
  try {
    localStorage.setItem(KEY, effect);
  } catch {
    // 저장만 안 될 뿐 이번 세션 동작에는 영향이 없다.
  }
}
