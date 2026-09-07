// 리포트 관련 공용 타입.
//
// backend/src/main/java/com/protractor/backend/domain/report/dto 와 1:1 대응한다.
// 필드를 바꾸면 서버 DTO(WeeklyReportSummaryResponse · WeeklyMetrics)도 같이 확인할 것.
//
// 마이페이지(/mypage/stats)의 DailyStat 과는 모양이 달라서 공유하지 않는다.

// 리포트 생성/처리 상태 (DB reports.status ENUM 과 동일)
export type ReportStatus = 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED';

/**
 * 항목별 자세 점수. 서버 DB 컬럼도 같은 이름이다(neck_score / chin_rest_score / shoulder_tilt_score).
 */
export interface ReportBodyPartScores {
  /** 거북목 점수. 그 주에 측정 기록이 없으면 null(0점과 다르다) */
  neck: number | null;
  /** 턱 괴기 점수. 라운드숄더가 빠진 자리를 이어받았다 */
  chinRest: number | null;
  shoulderTilt: number | null;
}

/** 감지 이벤트 총계. away 는 이벤트로 저장되지 않아 0 이 정상이다(away_seconds 로만 남는다). */
export interface ReportEventCounts {
  badPosture: number;
  drowsy: number;
  away: number;
  /** 휴대폰 사용. 자세가 아니라 집중을 깨는 행동이라 badPosture 에 합치지 않는다 */
  phoneUse: number;
  /**
   * 휴대폰을 보고 있던 시간 합(초). 횟수만으로는 "10초 확인"과 "20분 시청"이 같아 보인다.
   * 졸음은 구간 길이를 저장하지 않아 같은 값이 없다.
   */
  phoneUseSeconds: number;
}

/**
 * 도넛 차트용 분류. otherPosture 는 세부 종류를 알 수 없는 자세 이벤트다.
 *
 * 이름은 자세지만 도넛이 보여주는 것은 "집중을 깬 것들"이라 졸음·휴대폰도 함께 담긴다.
 */
export interface PostureBreakdown {
  forwardHead: number;
  shoulderTilt: number;
  /** 턱 괴기. 브라우저가 판정해 posture-checks 로 보낸 이벤트 수 */
  chinRest: number;
  otherPosture: number;
  drowsy: number;
  /** 휴대폰 사용. 브라우저(YOLO)가 판정해 세션 종료 시 phoneEvents 로 보낸 이벤트 수 */
  phoneUse: number;
  total: number;
}

/** 유해 자세 유형 키 — PostureBreakdown 의 필드명과 맞춘다. */
export type BadPostureType =
  | 'forwardHead'
  | 'shoulderTilt'
  | 'chinRest'
  | 'otherPosture'
  | 'drowsy'
  | 'phoneUse';

/** 일별 통계. 기록이 없는 날은 시간 0, 유지율 null 이다. */
export interface ReportDailyStat {
  date: string; // YYYY-MM-DD
  totalStudySeconds: number;
  focusedSeconds: number;
  goodPostureRatio: number | null;
}

/**
 * GET /reports/me/daily 한 항목 — 학습 캘린더의 하루 칸.
 *
 * 기록이 없는 날은 응답에 아예 없다. "0시간 공부한 날"과 구분해야 해서다.
 */
export interface DailyStudy {
  date: string; // YYYY-MM-DD
  totalStudySeconds: number;
  focusedSeconds: number;
  /** 그날 자세 측정이 없으면 null */
  goodPostureRatio: number | null;
  /** 그날 참여한 방 이름(중복 제거) */
  roomTitles: string[];
}

/**
 * 자세 하이라이트 한 건.
 * captureUrl 은 이벤트 캡처 저장이 아직 구현되지 않아 현재 항상 null 이다
 * (자세감지 파트가 캡처 업로드를 붙이면 서버가 자동으로 채운다).
 */
export interface PostureHighlight {
  /** LocalDateTime — 타임존 오프셋이 없다. 예: '2026-07-23T16:05:00' */
  capturedAt: string;
  captureUrl: string | null;
  bodyPart: string | null;
  detail: string | null;
  deviationDegrees: number | null;
  durationSeconds: number | null;
  severity: number | null;
  description: string | null;
}

/**
 * 전주 값. 차이가 아니라 원값이 와서 표기 방식은 FE 가 정한다.
 * 점수·유지율이 null 이면 전주 기록이 없는 것 — 비교 배지를 만들지 말 것(가짜 "+87%p" 방지).
 */
export interface PrevWeekMetrics {
  totalScore: number | null;
  goodPostureRatio: number | null;
  warningCount: number;
  bodyPartScores: ReportBodyPartScores;
  eventCounts: ReportEventCounts;
}

/** 주 하나의 추세 값(이번 주 포함 최근 4주). 측정이 없던 주는 유지율이 null 이다. */
export interface WeekTrendPoint {
  weekStart: string; // YYYY-MM-DD (월요일)
  focusedSeconds: number;
  goodPostureRatio: number | null;
}

export interface StretchingCounts {
  attemptCount: number;
  completedCount: number;
}

/** bestPosture 는 "바른 자세 캡처" 저장이 없어 현재 항상 null 이다. */
export interface ReportHighlights {
  bestPosture: PostureHighlight | null;
  worstPosture: PostureHighlight | null;
}

// GET /reports/me/summary — 마이페이지 카드와 주간 리포트 상세가 함께 쓴다
export interface WeeklyReportSummary {
  period: string; // 'WEEKLY'
  weekStart: string; // YYYY-MM-DD (월요일)
  weekEnd: string; // YYYY-MM-DD (일요일)
  dailyStats: ReportDailyStat[];
  /**
   * 시간대별 순공부 분(0시~23시, 항상 24칸).
   *
   * 서버에 "몇 시에 공부했는지"는 남지 않고 방에 있던 구간만 남는다. 그 구간에 순공부 시간을
   * 고르게 펼쳐 담은 근사값이다 — 쉬는 시간이 구간 안 어디였는지는 알 수 없다.
   */
  hourlyFocusMinutes: number[];
  totalStudySeconds: number;
  focusedSeconds: number;
  /** 자세 종합 점수(부위 점수 평균, 0~100). 기록이 없으면 null — "-" 로 표시 */
  totalScore: number | null;
  /** 학습 집중률 = 순공부 ÷ (순공부+자리비움), 0~100. 마이페이지 집중률과 같은 정의 */
  focusScore: number | null;
  goodPostureRatio: number | null; // 0~100, 측정 없으면 null
  /** 온보딩의 하루 목표(분). 미설정이면 셋 다 null */
  goalMinutes: number | null;
  weeklyGoalMinutes: number | null;
  /** 주간 목표 대비 순공부 달성률(%). 100 초과 가능 */
  goalAchievementRate: number | null;
  bodyPartScores: ReportBodyPartScores;
  eventCounts: ReportEventCounts;
  postureBreakdown: PostureBreakdown;
  prevWeek: PrevWeekMetrics;
  warningCount: number;
  stretching: StretchingCounts;
  highlights: ReportHighlights;
  /** 이번 주 포함 최근 4주 추세 */
  weeklyTrend: WeekTrendPoint[];
  /** 규칙 기반 한 줄 요약 — 리포트를 생성하지 않아도 항상 온다 */
  summaryText: string;
  /** 생성된 리포트의 LLM 소견 원문. 같은 기간의 COMPLETED 리포트가 없으면 null */
  aiFeedback: string | null;
}

// GET /reports/me (지난 리포트 목록 항목)
export interface ReportListItem {
  reportId: number;
  title: string;
  /** 리포트 대상 기간 (YYYY-MM-DD). 제목이 아니라 이 값으로 주차를 표시한다 */
  from: string;
  to: string;
  status: ReportStatus;
  /** 서버는 reports.requested_at 을 이 이름으로 내려준다 */
  createdAt: string;
  /**
   * 지금 다운로드가 성공할 수 있는 상태인지. 서버가 상태·파일 존재·만료를 모두 보고 정한다.
   *
   * 화면이 status 와 만료를 따로 판단하지 않고 이 값 하나로 버튼을 그린다. 서버의 실제 차단
   * 조건(ReportService.downloadPdf)과 어긋날 여지를 없앤다.
   */
  downloadable: boolean;
}

export interface ReportListPage {
  reports: ReportListItem[];
  page: {
    page: number;
    size: number;
    totalElements: number;
    totalPages: number;
  };
}

// POST /reports/me 요청 (PDF 종합 리포트 생성). 서버가 기간 최대 31일로 검증한다.
export interface ReportCreateRequest {
  from: string; // YYYY-MM-DD
  to: string; // YYYY-MM-DD
  title?: string;
}

// POST /reports/me 응답 (202 Accepted)
export interface ReportCreateResponse {
  reportId: number;
  status: ReportStatus;
}

// GET /reports/me/{reportId} (상태·상세 조회 — 생성 폴링용)
export interface ReportDetail {
  reportId: number;
  status: ReportStatus;
  from: string;
  to: string;
  // 백엔드에 Jackson null 제외 설정이 없어 키는 항상 오고 값만 null 이다.
  // optional(?) 로 두면 실제로는 생기지 않는 undefined 까지 열어두게 된다.
  summaryText: string | null;
  /** COMPLETED 일 때만 다운로드 API 경로가 담긴다 */
  pdfUrl: string | null;
  completedAt: string | null;
  /** FAILED 일 때 실패 사유. 화면에 그대로 보여 원인(키 미설정 등)을 알 수 있게 한다 */
  errorMessage: string | null;
}
