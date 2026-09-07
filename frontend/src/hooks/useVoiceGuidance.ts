// src/hooks/useVoiceGuidance.ts
import { useCallback, useEffect, useRef } from 'react';

import { cancelSpeech, isSpeechSupported, speak } from '@/lib/speech';

/**
 * 같은 종류의 안내를 다시 읽기까지 기다리는 시간.
 *
 * 졸음·휴대폰은 감지가 붙었다 떨어지기를 반복해서, 그대로 두면 몇 초에 한 번씩 같은 말을
 * 반복한다. 그 시점에는 안내가 아니라 소음이다.
 */
const DEFAULT_COOLDOWN_MS = 30_000;

interface AnnounceOptions {
  /** 이 시간 안에 같은 key 로 다시 들어오면 읽지 않는다 */
  cooldownMs?: number;
  /**
   * 쿨다운을 무시하고, 다른 안내를 읽는 중이어도 끊고 반드시 읽는다.
   * 스트레칭 시작·완료처럼 놓치면 흐름이 막히는 안내에만 쓴다.
   */
  force?: boolean;
}

/**
 * 자세 경고·스트레칭 알림을 목소리로 전한다.
 *
 * <p>
 * 화면을 보고 있지 않을 때를 위한 통로다. 작은 창(PiP)을 띄워도 결국 눈으로 봐야 알 수
 * 있는데, 다른 창에서 작업 중이면 그 창조차 안 볼 수 있다.
 *
 * <p>
 * 읽기는 <b>큰 화면 쪽 창</b>에서 한다. speechSynthesis 는 창마다 따로 있지만 작은 창은
 * 이 창이 만든 것이라, 어느 쪽을 보고 있든 이 창에서 읽으면 들린다. 작은 창이 열려 있는지
 * 신경 쓸 필요가 없다.
 *
 * @param enabled 꺼지면 읽지 않고, 읽던 것도 즉시 멈춘다
 */
export function useVoiceGuidance(enabled: boolean) {
  const supported = isSpeechSupported();
  /** 종류별 마지막으로 읽은 시각 */
  const lastSpokenAt = useRef(new Map<string, number>());

  /**
   * 최신 enabled 를 콜백에서 읽기 위한 상자.
   *
   * announce 를 의존성으로 쓰는 효과들이 토글할 때마다 다시 도는 걸 막는다. 그대로 두면
   * 음성을 껐다 켜는 것만으로 경고 안내가 처음부터 다시 울린다.
   */
  const enabledRef = useRef(enabled);
  useEffect(() => {
    enabledRef.current = enabled;
    // 끄는 순간 읽던 문장도 끊는다. 남겨 두면 껐는데도 한 문장이 더 나온다.
    if (!enabled) cancelSpeech();
  }, [enabled]);

  // 룸을 나가거나 새로고침하면 읽던 것을 멈춘다.
  useEffect(() => () => cancelSpeech(), []);

  /**
   * 안내를 읽는다. 읽지 않기로 한 경우 개발 모드에서는 이유를 남긴다.
   *
   * <p>
   * 로그가 필요한 이유가 있다. "소리가 안 난다"는 두 가지가 겹쳐 보인다 — 읽을 문장이
   * 애초에 안 만들어진 경우(감지가 안 됐거나 쿨다운에 걸림)와, 문장은 만들었는데 브라우저가
   * 소리를 안 낸 경우다. 둘은 고치는 곳이 완전히 다른데 밖에서는 구분이 안 된다.
   * 여기 로그(`[음성] …`)와 lib/speech 의 재생 로그(`▶ / ■ / ⛔`)를 같이 보면 갈린다.
   */
  const announce = useCallback(
    (key: string, text: string, options: AnnounceOptions = {}) => {
      if (!isSpeechSupported()) return;
      if (!enabledRef.current) {
        if (import.meta.env.DEV) console.info(`[음성] 꺼짐 — ${key}`);
        return;
      }

      const now = Date.now();
      if (!options.force) {
        const last = lastSpokenAt.current.get(key) ?? 0;
        const cooldown = options.cooldownMs ?? DEFAULT_COOLDOWN_MS;
        const waited = now - last;
        if (waited < cooldown) {
          if (import.meta.env.DEV) {
            console.info(
              `[음성] 쿨다운 — ${key} (${Math.round((cooldown - waited) / 1000)}초 남음)`,
            );
          }
          return;
        }
      }

      if (import.meta.env.DEV) console.info(`[음성] 요청 — ${key}`);

      // 실제로 읽기 시작했을 때만 쿨다운을 건다. 다른 안내를 읽는 중이라 버려진 문장까지
      // 쿨다운에 넣으면, 말한 적도 없는 안내가 그다음 20초 동안 또 막힌다.
      if (speak(text, { interrupt: options.force })) {
        lastSpokenAt.current.set(key, now);
      }
    },
    [],
  );

  return { supported, announce };
}
