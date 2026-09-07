// src/types/studyRecord.ts
// 스터디 기록(세션) API 타입 (/api/v1/study-records)

/** GET /study-records/{id} — 백엔드 StudyRecordDetailResponse 와 1:1 대응 */
export interface StudyRecordDetail {
  studyRecordId: number;
  roomId: number;
  memberId: number;
  joinedAt: string;
  leftAt: string | null;
  endReason: string | null;
  totalStudySeconds: number;
  focusedSeconds: number;
  breakSeconds: number;
  awaySeconds: number;
  badPostureSeconds: number;
  /** 종료 처리 전에는 null */
  goodPostureRatio: number | null;
  warningCount: number;
  stretchingAttemptCount: number;
  stretchingCompletedCount: number;
}

/**
 * 졸음 감지 이벤트 한 건 — 백엔드 DrowsinessCheckRequest 와 1:1 대응.
 *
 * 판정은 브라우저가 하지만 저장은 자세와 같이 실시간이다. 졸음 구간이 닫히는 순간
 * POST /study-sessions/{sessionId}/drowsiness-checks 로 한 건씩 올라간다.
 *
 * 예전에는 세션 종료 요청에 목록으로 실어 보냈는데, 탭이 강제로 닫히거나 브라우저가 죽으면
 * 그 세션의 졸음 기록이 통째로 사라졌다.
 */
export interface DrowsinessEvent {
  /** 졸음 단계 1~5. 서버가 events.severity 로 저장한다 (범위를 벗어나면 400) */
  level: number;
  /** LocalDateTime — 오프셋 없는 로컬 시각. 예: '2026-07-31T14:05:00' */
  detectedAt: string;
}

/**
 * 휴대폰 사용 이벤트 한 건 — 백엔드 PhoneCheckRequest 와 1:1 대응.
 *
 * 졸음과 같은 경로다. 브라우저(YOLO)가 판정하고, 화면에서 폰이 사라져 구간이 닫히는 순간
 * POST /study-sessions/{sessionId}/phone-checks 로 한 건씩 올라간다.
 * 자세가 아니라 집중을 깨는 행동이라 부위·세부 종류 없이 구간만 보낸다.
 */
export interface PhoneUseEvent {
  /** LocalDateTime — 오프셋 없는 로컬 시각. 예: '2026-07-31T14:05:00' */
  startedAt: string;
  /** 화면에서 폰이 사라진 시각 */
  endedAt: string;
  durationSeconds: number;
}

/**
 * 스터디룸에서 결과 화면으로 넘기는 세션 요약.
 *
 * 점수는 종료 API 가 서버에서 확정하지만, 결과 화면은 응답을 기다리지 않고 바로 띄운다.
 * 그래서 방에서 실제로 센 값을 그대로 들고 나온다. 누적 기록은 study_records 를 보면 된다.
 */
/**
 * 세션 종료 응답(PATCH /study-records/{id}/end).
 *
 * 나쁜 자세 시간·경고 횟수·점수는 전부 서버가 저장된 events 를 집계해 계산한 값이다.
 * 종료 화면은 이걸 그대로 쓴다 — 클라이언트가 같은 계산을 따로 하면 두 숫자가 어긋난다.
 */
export interface StudyEndResult {
  studyRecordId: number;
  leftAt: string;
  endReason: string;
  totalStudySeconds: number;
  focusedSeconds: number;
  /** 서버가 집계한 나쁜 자세 시간. totalStudySeconds 를 넘지 않게 잘려 있다 */
  badPostureSeconds: number;
  /** 자세 + 졸음 이벤트 수 */
  warningCount: number;
  goodPostureRatio: number;
  focusScore: number;
  neckScore: number;
  /** 턱 괴기 점수 */
  chinRestScore: number;
  shoulderTiltScore: number;
  totalScore: number;
}

export interface StudySessionSummary {
  roomId: string;
  roomTitle: string;
  studyRecordId: number | null;
  /** 방에 머문 시간(초) — 카메라가 켜져 있고 스트레칭 중이 아닐 때만 흐른다 */
  focusedSeconds: number;
  /** 집중+휴식+자리비움 합계(초). 결과 화면이 "순공 / 총 시간"으로 보여준다 */
  totalStudySeconds: number;
  /** 서버가 확정한 나쁜 자세 경고 횟수 */
  postureWarningCount: number;
  /** 나쁜 자세가 확정된 시간(초). 지속 판정 × 확정 횟수 */
  badPostureSeconds: number;
  stretchingCount: number;
  /**
   * 학습 장면 저장(타임랩스)에 동의한 상태로 공부했는가.
   *
   * 종료 화면이 "담긴 장면이 없다"의 이유를 구분하는 데 쓴다. 동의가 꺼져 있던 것과
   * 켜져 있었지만 너무 짧았던 것은 사용자가 할 일이 완전히 다르다.
   */
  timelapseConsent: boolean;
}

/**
 * 홈 화면 개인 학습 요약 — GET /api/v1/study-records/me/summary
 *
 * 시간은 모두 초 단위다. "21h 30m" 같은 표기는 화면마다 다를 수 있어 서버가 만들지 않는다.
 */
export interface StudySummary {
  /** 오늘 집중 시간(초) */
  todayFocusedSeconds: number;
  /** 이번 주 시작일(월요일, YYYY-MM-DD) */
  weekStart: string;
  /** 이번 주 종료일(일요일) */
  weekEnd: string;
  /** 이번 주 집중 시간(초) */
  weekFocusedSeconds: number;
  /** 지난주 집중 시간(초) */
  lastWeekFocusedSeconds: number;
  /** 지난주 대비 증감(초). 음수면 줄어든 것 */
  weekDiffSeconds: number;
  /** 연속 학습일수. 오늘 아직 안 했으면 어제까지로 센다 */
  streakDays: number;
}
