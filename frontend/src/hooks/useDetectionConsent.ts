// src/hooks/useDetectionConsent.ts
import { useCallback, useEffect, useRef, useState } from 'react';

import { getMyOnboarding } from '@/api/onboardingApi';

/**
 * 자세·졸음 감지 동의 상태.
 *
 * 가입할 때는 둘 다 필수라 켜져 있지만, 마이페이지에서 철회할 수 있다
 * (서버가 PATCH 로 철회를 허용한다 — docs/backend/onboarding-consent.md).
 * 철회한 채로 스터디룸에 들어가면 동의하지 않은 감지가 도는 셈이라 입장을 막아야 한다.
 */
export interface DetectionConsentState {
  /**
   * 두 감지에 모두 동의한 상태인가.
   *
   * 아직 확인 전이거나 확인에 실패하면 null 이다. **null 을 미동의로 취급하면 안 된다** —
   * 서버가 잠깐 느린 것만으로 멀쩡한 사용자가 방에 못 들어가게 된다.
   */
  consented: boolean | null;
  /** 재동의하고 돌아왔을 때 다시 확인시키는 용도 */
  refresh: () => void;
}

/**
 * 감지 동의 상태를 읽어 둔다.
 *
 * @param enabled 로그인 상태에서만 부른다. 비로그인은 온보딩 API 가 401 이다.
 */
export function useDetectionConsent(enabled: boolean): DetectionConsentState {
  const [consented, setConsented] = useState<boolean | null>(null);
  const [version, setVersion] = useState(0);
  // 응답이 늦게 온 이전 요청이 최신 값을 덮어쓰지 않게 한다
  const aliveRef = useRef(true);

  useEffect(() => {
    if (!enabled) {
      return;
    }
    aliveRef.current = true;
    getMyOnboarding()
      .then((me) => {
        if (!aliveRef.current) return;
        setConsented(
          me.postureDetectionConsent === true &&
            me.drowsinessDetectionConsent === true,
        );
      })
      .catch(() => {
        // 못 읽었으면 모르는 상태로 둔다. 막는 쪽으로 기울면 서버 오류가 곧
        // 입장 불가가 되어, 원인을 모르는 사용자가 방에 못 들어간다.
        if (aliveRef.current) setConsented(null);
      });

    return () => {
      aliveRef.current = false;
    };
  }, [enabled, version]);

  const refresh = useCallback(() => setVersion((v) => v + 1), []);

  return { consented, refresh };
}
