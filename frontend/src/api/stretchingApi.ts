import { api } from '@/api/client';
import type {
  Stretching,
  StretchingCompleteRequest,
  StretchingEvent,
} from '@/types/stretching';

// ── 목 데이터 (서버 조회 실패 시 폴백) ───────────────────────
// backend/src/main/resources/schema.sql 의 stretchings 시드와 같은 내용이다.
// 둘 중 하나만 고치면 목/실서버 동작이 달라지므로 함께 수정해야 한다.
const mockStretchings: Stretching[] = [
  {
    stretchingId: 1,
    name: '목 옆으로 기울이기',
    targetPart: 'NECK',
    guideText:
      '어깨를 고정한 채 머리를 왼쪽으로 천천히 기울여 귀를 어깨에 붙인다는 느낌으로 늘려주세요. 반대쪽도 같은 방법으로 반복합니다.',
    highlightLandmarks:
      '["NOSE","LEFT_EAR","RIGHT_EAR","LEFT_SHOULDER","RIGHT_SHOULDER"]',
    holdSeconds: 5,
    sortOrder: 1,
  },
  {
    stretchingId: 2,
    name: '목 돌리기',
    targetPart: 'NECK',
    guideText:
      '고개로 큰 원을 그린다는 느낌으로 천천히 한 바퀴 돌려주세요. 반대 방향으로도 돌려줍니다.',
    highlightLandmarks:
      '["NOSE","LEFT_EAR","RIGHT_EAR","LEFT_SHOULDER","RIGHT_SHOULDER"]',
    holdSeconds: 3,
    sortOrder: 2,
  },
  {
    stretchingId: 3,
    name: '목 대각선 스트레칭',
    targetPart: 'NECK',
    guideText:
      '고개를 45도 옆으로 돌린 뒤 그 방향으로 비스듬히 숙여 목 뒤쪽을 늘려주세요. 반대쪽도 반복합니다.',
    highlightLandmarks:
      '["NOSE","LEFT_EAR","RIGHT_EAR","LEFT_SHOULDER","RIGHT_SHOULDER"]',
    holdSeconds: 3,
    sortOrder: 3,
  },
  {
    stretchingId: 4,
    name: '어깨 으쓱하기',
    targetPart: 'SHOULDER',
    guideText:
      '양 어깨를 귀 쪽으로 끝까지 끌어올려 2초간 멈춘 뒤, 힘을 빼고 툭 떨어뜨립니다.',
    highlightLandmarks:
      '["LEFT_SHOULDER","RIGHT_SHOULDER","LEFT_EAR","RIGHT_EAR"]',
    holdSeconds: 3,
    sortOrder: 4,
  },
  {
    stretchingId: 5,
    name: '어깨 돌리기',
    targetPart: 'SHOULDER',
    guideText: '양 어깨로 큰 원을 그리듯 뒤쪽으로 천천히 돌려주세요.',
    highlightLandmarks:
      '["LEFT_SHOULDER","RIGHT_SHOULDER","LEFT_ELBOW","RIGHT_ELBOW"]',
    holdSeconds: 3,
    sortOrder: 5,
  },
  {
    stretchingId: 6,
    name: '크로스바디 스트레칭',
    targetPart: 'SHOULDER',
    guideText:
      '한쪽 팔을 몸 앞으로 쭉 뻗어 가슴 쪽으로 당기고, 반대 팔로 감싸 눌러줍니다. 양쪽 모두 반복합니다.',
    highlightLandmarks:
      '["LEFT_SHOULDER","RIGHT_SHOULDER","LEFT_ELBOW","RIGHT_ELBOW","LEFT_WRIST","RIGHT_WRIST"]',
    holdSeconds: 4,
    sortOrder: 6,
  },
];

// ── API 함수 ─────────────────────────────────────────────────

/**
 * GET /stretchings — 활성화된 스트레칭 가이드 목록 (sort_order 순)
 *
 * 백엔드에 시드가 들어가 실제 API 를 쓰되, 서버가 꺼져 있거나 시드가 아직
 * 적용되지 않았을 때 스터디룸 스트레칭 기능 자체가 멈추지 않도록 목으로 대체한다.
 */
export async function getStretchings(): Promise<Stretching[]> {
  try {
    const { data } = await api.get<Stretching[]>('/stretchings');
    if (data.length > 0) return data;
  } catch {
    // 아래 목 데이터로 진행
  }
  return mockStretchings;
}

/** POST /study-records/{studyRecordId}/stretchings/{stretchingId}/start — 스트레칭 시작 */
export async function startStretching(
  studyRecordId: number,
  stretchingId: number,
): Promise<StretchingEvent> {
  const { data } = await api.post<StretchingEvent>(
    `/study-records/${studyRecordId}/stretchings/${stretchingId}/start`,
  );
  return data;
}

/** PATCH /stretching-events/{eventId} — 완료율 저장 */
export async function completeStretching(
  eventId: number,
  body: StretchingCompleteRequest,
): Promise<StretchingEvent> {
  const { data } = await api.patch<StretchingEvent>(
    `/stretching-events/${eventId}`,
    body,
  );
  return data;
}

/** POST /study-records/{studyRecordId}/stretchings/{stretchingId}/skip — 스트레칭 건너뛰기 */
export async function skipStretching(
  studyRecordId: number,
  stretchingId: number,
  /** 왜 건너뛰었는지. 서버는 30자까지 받고, 안 보내면 비워 둔다. */
  body?: { reason?: string },
): Promise<StretchingEvent> {
  const { data } = await api.post<StretchingEvent>(
    `/study-records/${studyRecordId}/stretchings/${stretchingId}/skip`,
    body,
  );
  return data;
}
