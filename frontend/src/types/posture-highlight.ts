// src/types/posture-highlight.ts

/** 경미 → 중간 → 심각 (노랑 → 주황 → 빨강) */
export type Severity = 'mild' | 'moderate' | 'severe';

export const SEVERITY_ORDER: Severity[] = ['mild', 'moderate', 'severe'];

/**
 * 비디오 위에 표시할 신체 부위 강조.
 *
 * 좌표는 원본 프레임 기준 정규화 값(0~1)이다.
 * MediaPipe 랜드마크가 그대로 0~1로 나오므로 변환 없이 넣으면 된다.
 */
export interface BodyHighlight {
  /** 'neck' | 'shoulder-left' | 'shoulder-right' | 'back' 등 */
  id: string;
  severity: Severity;
  /** 가로 위치 0(왼쪽) ~ 1(오른쪽) */
  x: number;
  /** 세로 위치 0(위) ~ 1(아래) */
  y: number;
  /** 프레임 높이 대비 반지름 (0~1) */
  radius: number;
  /** 부위 이름 — 화면에 함께 표시 */
  label: string;
}

/** 심각도가 가장 높은 값을 고른다 */
export function maxSeverity(highlights: BodyHighlight[]): Severity | null {
  if (highlights.length === 0) return null;
  return highlights.reduce<Severity>((acc, h) => {
    return SEVERITY_ORDER.indexOf(h.severity) > SEVERITY_ORDER.indexOf(acc)
      ? h.severity
      : acc;
  }, 'mild');
}