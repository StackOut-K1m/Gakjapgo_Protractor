// src/hooks/useCoaching.ts
import { useEffect, useMemo, useState } from 'react';
import { COACHING_MODES } from '@/types/coaching';
import type { CheckState, CoachingMode, CoachingState } from '@/types/coaching';

/**
 * 감지 결과를 코칭 UI가 쓰는 형태로 만들어 준다.
 *
 * 경고의 출처는 서버다. 브라우저는 피처만 뽑아 보내고, 지속 여부를 확정하는 건
 * 서버이므로(usePostureFrames 참고) 여기서는 확정된 항목 id 를 받아 화면에 옮기기만 한다.
 *
 * TODO: 졸음 감지는 아직 서버 판정이 없어 항상 정상으로 표시된다.
 *
 * @param postureWarningIds 서버가 확정한 경고 항목 id 목록 ('neck' | 'shoulder' | 'back')
 */
export function useCoaching(
  cameraOn: boolean,
  forcedMode: CoachingMode | null = null,
  postureWarningIds: string[] = [],
): CoachingState {
  const [elapsed, setElapsed] = useState(0);

  // 카메라가 꺼져 있으면 그게 최우선 상황이다
  const mode: CoachingMode = !cameraOn
    ? 'camera-off'
    : (forcedMode ?? 'posture');

  // DevControls 로 모드를 강제하면 데모 경고가 우선한다. 실제 판정과 섞이면
  // 어느 쪽이 띄운 경고인지 화면만 보고는 구분할 수 없다.
  const serverWarningKey =
    mode === 'posture' && forcedMode === null
      ? postureWarningIds.join(',')
      : '';

  const hasWarning =
    !cameraOn || forcedMode !== null || serverWarningKey.length > 0;

  useEffect(() => {
    if (!hasWarning) {
      setElapsed(0);
      return;
    }
    // 경고 항목이 바뀌면 지속 시간도 다시 센다
    setElapsed(0);
    const id = setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [hasWarning, mode, serverWarningKey]);

  return useMemo<CoachingState>(() => {
    const config = COACHING_MODES[mode];
    const serverWarnings = serverWarningKey ? serverWarningKey.split(',') : [];
    const checks: Record<string, CheckState> = {};

    config.checks.forEach((check, index) => {
      if (mode === 'camera-off') {
        checks[check.id] = 'paused';
      } else if (serverWarnings.includes(check.id)) {
        checks[check.id] = 'warning';
      } else if (forcedMode !== null && index === 0) {
        // 데모: 모드를 강제하면 첫 항목만 경고 상태로 둔다
        checks[check.id] = 'warning';
      } else {
        checks[check.id] = 'ok';
      }
    });

    const warningIds = config.checks
      .filter((check) => checks[check.id] === 'warning')
      .map((check) => check.id);

    // 카메라 꺼짐은 항목 경고가 아니라 상황 자체가 경고다
    if (mode === 'camera-off') {
      warningIds.push(config.checks[0].id);
    }

    return { mode, checks, warningIds, elapsedSeconds: elapsed };
  }, [mode, forcedMode, serverWarningKey, elapsed]);
}
