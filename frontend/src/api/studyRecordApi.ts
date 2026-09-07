import { api } from '@/api/client';
import type {
  DrowsinessEvent,
  PhoneUseEvent,
  StudyEndResult,
  StudyRecordDetail,
  StudySummary,
} from '@/types/studyRecord';

/**
 * 종료 사유.
 *
 * COMPLETED·USER_EXIT·TIMEOUT 은 백엔드 EndRequest 의 allowableValues 와 같다.
 * DISCONNECTED 는 서버가 미응답 세션을 대신 종료할 때 쓰는 값인데(endByDisconnect),
 * 창이 닫히는 순간 프론트가 마지막으로 보내는 종료도 사용자 의도가 아니라 같은 값을 쓴다
 * (useSessionUnloadFlush 참고). 컬럼은 VARCHAR 라 값 제약은 없다.
 */
export type StudyEndReason =
  | 'COMPLETED'
  | 'USER_EXIT'
  | 'TIMEOUT'
  | 'DISCONNECTED';

/**
 * POST /study-sessions/{sessionId}/drowsiness-checks — 졸음 한 건 저장.
 *
 * 감지가 확정되는 즉시 부른다. 예전에는 브라우저가 세션 내내 모아 두고 종료 요청에 실어
 * 보냈는데, 탭이 강제로 닫히면 그 세션의 졸음 기록이 통째로 사라졌다.
 *
 * sessionId 는 studyRecordId 와 같은 값이다. 자정을 넘겨 기록이 갈리면 이 값도 바뀌므로
 * 호출 시점의 최신 id 를 써야 한다(옛 id 로 보내면 404).
 */
export async function sendDrowsinessCheck(
  sessionId: number,
  event: DrowsinessEvent,
): Promise<void> {
  await api.post(`/study-sessions/${sessionId}/drowsiness-checks`, event);
}

/**
 * POST /study-sessions/{sessionId}/phone-checks — 휴대폰 사용 구간 한 건 저장.
 *
 * 화면에서 폰이 사라져 구간이 닫히는 즉시 부른다. 졸음과 같은 이유로 실시간 저장이다.
 */
export async function sendPhoneCheck(
  sessionId: number,
  event: PhoneUseEvent,
): Promise<void> {
  await api.post(`/study-sessions/${sessionId}/phone-checks`, event);
}

/**
 * PATCH /study-records/{id}/end — 세션 종료.
 *
 * 서버가 저장된 events 를 집계해 자세 통계와 점수를 계산한다. 이 호출이 없으면
 * study_records 의 점수 컬럼(total_score, good_posture_ratio 등)이 NULL 로 남아
 * 리포트에 쓸 데이터가 만들어지지 않는다.
 *
 * 감지 이벤트는 이 요청으로 보내지 않는다. 자세는 서버가 실시간 판정으로, 턱 괴기·졸음·
 * 휴대폰은 브라우저가 각자의 실시간 입구로 그때그때 저장해 둔 것을 집계하기만 한다.
 * (백엔드 EndRequest 에서 drowsinessEvents·phoneEvents 필드를 없앴다 — 목록을 받는
 *  필드는 "추가"가 아니라 "그 종류를 전부 지우고 교체"로 동작해서, 빈 배열만 실려 와도
 *  실시간으로 쌓인 기록이 사라지고 응답은 200 이 된다.)
 *
 * endReason 은 반드시 채워야 한다. 서버는 이 값이 null 인지로 종료 여부를 판단해
 * 중복 호출을 409 로 막는다.
 *
 * 이미 종료된 세션이면 409 다.
 */
export async function endStudyRecord(
  studyRecordId: number,
  body: {
    focusedSeconds: number;
    breakSeconds: number;
    awaySeconds: number;
    endReason: StudyEndReason;
  },
): Promise<StudyEndResult> {
  const { data } = await api.patch<StudyEndResult>(
    `/study-records/${studyRecordId}/end`,
    body,
  );
  return data;
}

/** 진행 동기화 응답. 서버에 저장된 누적값을 그대로 돌려준다. */
export interface StudyProgress {
  /**
   * 저장된 기록의 id.
   *
   * 보낸 id 와 다를 수 있다. 학습 기록은 "방 × 회원 × 학습일" 단위라, 자정을 지나면 서버가 어제
   * 행을 마감하고 새 행을 만든다(rollover). 그때 이 값이 새 행의 id 로 바뀐다.
   */
  studyRecordId: number;
  totalStudySeconds: number;
  focusedSeconds: number;
  breakSeconds: number;
  awaySeconds: number;
  syncedAt: string;
}

/**
 * PATCH /study-records/{id}/progress — 누적 시간 동기화.
 *
 * 세션 중간에 시간만 반영할 때 쓴다. 점수는 계산하지 않는다(종료 시 계산).
 * 이미 종료된 세션이면 409 다.
 *
 * 응답의 studyRecordId 를 반드시 확인해야 한다. 자정을 지나 기록이 나뉘면 이 값이 바뀌고,
 * 옛 id 로 계속 보내면 이미 마감된 기록이라 409 가 된다.
 */
export async function syncStudyProgress(
  studyRecordId: number,
  body: { focusedSeconds: number; breakSeconds: number; awaySeconds: number },
): Promise<StudyProgress> {
  const { data } = await api.patch<StudyProgress>(
    `/study-records/${studyRecordId}/progress`,
    body,
  );
  return data;
}

/** GET /study-records/{id} — 세션 상세(읽기 전용) */
export async function getStudyRecord(
  studyRecordId: number,
): Promise<StudyRecordDetail> {
  const { data } = await api.get<StudyRecordDetail>(
    `/study-records/${studyRecordId}`,
  );
  return data;
}

/**
 * 홈 화면 개인 학습 요약. 오늘·이번 주·연속 학습일수를 한 번에 가져온다.
 *
 * 같은 화면에서 함께 쓰이는 값이라 서버가 묶어서 준다. 나눠 부르면 요청만 늘고
 * 화면이 부분적으로 채워지는 구간이 생긴다.
 */
export async function getStudySummary(): Promise<StudySummary> {
  const { data } = await api.get<StudySummary>('/study-records/me/summary');
  return data;
}
