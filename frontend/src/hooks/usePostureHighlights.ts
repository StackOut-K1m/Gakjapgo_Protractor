// src/hooks/usePostureHighlights.ts
import { useMemo } from 'react';
import type { BodyHighlight, Severity } from '@/types/posture-highlight';

/**
 * 감지 결과를 화면 강조로 변환한다.
 *
 * TODO: MediaPipe 연동
 *   PoseLandmarker 결과에서 부위별 좌표와 심각도를 계산해 넘긴다.
 *   랜드마크는 이미 0~1 정규화 값이라 그대로 x, y 에 넣으면 된다.
 *
 *   예) 거북목 = 귀(7,8)와 어깨(11,12)의 x 차이
 *       어깨 비대칭 = 어깨(11,12)의 y 차이
 *       심각도 = 각도 임계값 구간으로 mild / moderate / severe 분류
 *
 * 지금은 개발용 패널(DevControls)에서 넘긴 심각도로 미리보기한다.
 */
export function usePostureHighlights(
  enabled: boolean,
  severity: Severity | null = null,
): BodyHighlight[] {
  return useMemo(() => {
    if (!enabled || !severity) return [];

    // 데모용 고정 좌표 — 실제로는 랜드마크에서 계산된다
    return [
      {
        id: 'neck',
        severity,
        x: 0.5,
        y: 0.46,
        radius: 0.16,
        label: '목',
      },
      {
        id: 'shoulder-left',
        severity: severity === 'severe' ? 'moderate' : 'mild',
        x: 0.36,
        y: 0.72,
        radius: 0.13,
        label: '왼쪽 어깨',
      },
    ];
  }, [enabled, severity]);
}
