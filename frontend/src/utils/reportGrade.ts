// src/utils/reportGrade.ts
//
// 점수 → 등급. 결과 화면과 리포트 카드가 같은 기준을 써야 해서 한곳에 둔다.
// 예전에는 두 파일에 같은 값이 복사돼 있었다 — 기준을 조정할 때 한쪽만 고치면 같은 점수가
// 화면마다 다른 등급으로 보인다.

export interface ReportGrade {
  label: string;
  /** CSS 변수 이름 그대로. 등급 글자색과 그래프 막대 색에 같이 쓴다 */
  color: string;
}

/**
 * 0~100 점을 등급으로 옮긴다.
 *
 * 경계값은 임시다 — 점수 공식 자체가 임시값이라(StudyRecordService 의 PART_PENALTY_PER_EVENT)
 * 감지 정확도가 확정되면 함께 조정해야 한다.
 */
export function reportGrade(score: number): ReportGrade {
  if (score >= 85) return { label: '우수', color: 'var(--gak-status-ok)' };
  if (score >= 70) return { label: '양호', color: 'var(--gak-status-warning)' };
  return { label: '경고', color: 'var(--gak-status-danger)' };
}
