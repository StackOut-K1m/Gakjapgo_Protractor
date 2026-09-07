import { api } from '@/api/client';
import type {
  DailyStudy,
  ReportCreateRequest,
  ReportCreateResponse,
  ReportDetail,
  ReportDailyStat,
  ReportListPage,
  WeeklyReportSummary,
} from '@/types/report';
import {
  addDays,
  lastWeekRange,
  parseDateString,
  toDateString,
} from '@/utils/week';

/**
 * 주간 요약을 목 데이터로 돌릴지. mypageApi 와 같은 방식으로 <b>켜야 켜진다.</b>
 *
 * 예전에는 {@code !== 'false'} 였다. 그러면 아무것도 설정하지 않은 환경에서 목이 켜진다 —
 * .env.local 이 없는 사람과 <b>배포 이미지</b>가 그렇다. frontend/Dockerfile 은 이 값을 넣지
 * 않고 .env.production 도 없어서, 배포된 마이페이지는 계속 가짜 주간 요약을 보여주고 있었다.
 * 화면 확인용 편의가 배포본의 거짓말이 되면 안 된다.
 *
 * 백엔드 GET /reports/me/summary 는 구현돼 있다. 로컬 DB 에 학습 기록이 없어 전부 0 으로만
 * 보이는 게 답답하면 .env.local 에 VITE_USE_MOCK=true 를 둔다.
 */
const USE_MOCK_SUMMARY = import.meta.env.VITE_USE_MOCK === 'true';

const delay = (ms = 300) => new Promise((r) => setTimeout(r, ms));

// 지난주(월~일) 범위 계산은 utils/week.ts 의 lastWeekRange() 하나만 쓴다.
// 여기에도 같은 이름의 함수가 있었는데 반환 모양이 달라({from,to} vs {start,end,dates})
// 같은 파일 안에서 두 형태가 섞여 있었다.

// ── 목 데이터 ────────────────────────────────────────────────
//
// 리포트는 "지난주 월~일" 결산이라 오늘 요일과 무관하게 범위가 고정된다.
// 값은 랜덤이 아니라 고정값이다 — 새로고침마다 그래프가 널뛰면 확인이 어렵다.
const MOCK_STUDY_HOURS = [4.5, 6.2, 5, 3.8, 7.1, 8.5, 4]; // 월→일
const MOCK_POSTURE_RATIO = [88, 82, 85, 79, 86, 91, 87]; // 월→일

function buildMockDailyStats(dates: string[]): ReportDailyStat[] {
  return dates.map((date, i) => {
    const total = Math.round(MOCK_STUDY_HOURS[i] * 3600);
    return {
      date,
      totalStudySeconds: total,
      focusedSeconds: Math.round(total * 0.92),
      goodPostureRatio: MOCK_POSTURE_RATIO[i],
    };
  });
}

function buildMockSummary(weekStart?: string): WeeklyReportSummary {
  const dates = weekStart
    ? Array.from({ length: 7 }, (_, i) =>
        toDateString(addDays(parseDateString(weekStart), i)),
      )
    : lastWeekRange().dates;

  const dailyStats = buildMockDailyStats(dates);
  const totalStudySeconds = dailyStats.reduce(
    (acc, d) => acc + d.totalStudySeconds,
    0,
  );
  const focusedSeconds = dailyStats.reduce(
    (acc, d) => acc + d.focusedSeconds,
    0,
  );
  // 이번 주 포함 4주 추세. 마지막 항목은 이번 주 실제 합계와 맞춘다.
  const trendMondays = [-21, -14, -7, 0].map((off) =>
    toDateString(addDays(parseDateString(dates[0]), off)),
  );
  const trendFocused = [68400, 79200, 72000, focusedSeconds];
  const trendRatio = [80, 83, 85, 87];

  return {
    period: 'WEEKLY',
    weekStart: dates[0],
    weekEnd: dates[6],
    dailyStats,
    // 저녁~밤에 몰린 목 데이터. 실제 서버는 방에 있던 구간에서 계산한다.
    hourlyFocusMinutes: [
      0, 0, 0, 0, 0, 0, 0, 0, 20, 25, 55, 65, 30, 30, 75, 80, 45, 45, 55, 55,
      90, 90, 50, 50,
    ],
    totalStudySeconds,
    focusedSeconds,
    totalScore: 87,
    focusScore: 81,
    goodPostureRatio: 87,
    goalMinutes: 360,
    weeklyGoalMinutes: 2520,
    goalAchievementRate: Math.round((focusedSeconds / 60 / 2520) * 100),
    weeklyTrend: trendMondays.map((ws, i) => ({
      weekStart: ws,
      focusedSeconds: trendFocused[i],
      goodPostureRatio: trendRatio[i],
    })),
    bodyPartScores: { neck: 78, chinRest: 82, shoulderTilt: 90 },
    // away 는 이벤트로 저장되지 않아 서버도 0 을 준다.
    eventCounts: {
      badPosture: 42,
      drowsy: 12,
      away: 0,
      phoneUse: 8,
      phoneUseSeconds: 742,
    },
    // 도넛 차트의 근거. total 은 서버가 합계를 직접 내려준다.
    postureBreakdown: {
      forwardHead: 22,
      shoulderTilt: 14,
      chinRest: 6,
      otherPosture: 0,
      drowsy: 12,
      phoneUse: 8,
      total: 62,
    },
    prevWeek: {
      totalScore: 82,
      goodPostureRatio: 82,
      warningCount: 21,
      bodyPartScores: { neck: 71, chinRest: 74, shoulderTilt: 88 },
      eventCounts: {
        badPosture: 52,
        drowsy: 15,
        away: 0,
        phoneUse: 11,
        phoneUseSeconds: 1104,
      },
    },
    warningCount: 19,
    stretching: { attemptCount: 11, completedCount: 8 },
    highlights: {
      // 서버는 "바른 자세 캡처" 데이터가 없어 항상 null 을 준다.
      bestPosture: null,
      worstPosture: {
        capturedAt: `${dates[3]}T16:05:00`,
        // 이벤트 캡처 업로드가 붙기 전까지 서버도 null 이다. 화면은 자리표시 그림을 쓴다.
        captureUrl: null,
        bodyPart: 'NECK',
        detail: 'FORWARD_HEAD',
        deviationDegrees: 15.4,
        durationSeconds: 412,
        severity: 4,
        description:
          '목 각도가 앞으로 15도 이상 꺾인 상태로, 거북목 위험 상태가 오래 지속되었습니다.',
      },
    },
    summaryText:
      '거북목 감지 횟수가 전주 대비 15% 감소했습니다. 목 스트레칭을 꾸준히 유지하세요.',
    aiFeedback:
      '전체적으로 지난 주 대비 바른 자세율이 82%에서 87%로 향상되었습니다. 목 스트레칭을 꾸준히 수행하면서 장시간 정자세를 유지하는 빈도가 높아졌습니다. 다만 목요일과 금요일 늦은 오후(15~17시)에는 여전히 거북목 위험 자세가 몰려 있어, 이 시간대에 50분 학습 후 10분 휴식을 권장합니다.',
  };
}

// ── API 함수 ─────────────────────────────────────────────────

// GET /reports/me/summary — 최신 주간 리포트 요약
export async function getWeeklyReportSummary(range?: {
  period?: string;
  weekStart?: string;
}): Promise<WeeklyReportSummary> {
  if (USE_MOCK_SUMMARY) {
    await delay();
    return buildMockSummary(range?.weekStart);
  }
  const { data } = await api.get<WeeklyReportSummary>('/reports/me/summary', {
    params: range,
  });
  return data;
}

// GET /reports/me — 내 리포트 목록
export async function getMyReports(
  page = 0,
  size = 10,
): Promise<ReportListPage> {
  const { data } = await api.get<ReportListPage>('/reports/me', {
    params: { page, size },
  });
  return data;
}

// POST /reports/me — PDF 종합 리포트 생성 요청 (202 Accepted)
export async function createReport(
  body: ReportCreateRequest,
): Promise<ReportCreateResponse> {
  const { data } = await api.post<ReportCreateResponse>('/reports/me', body);
  return data;
}

// GET /reports/me/{reportId} — 리포트 상태·상세 (생성 폴링용)
export async function getReportDetail(reportId: number): Promise<ReportDetail> {
  const { data } = await api.get<ReportDetail>(`/reports/me/${reportId}`);
  return data;
}

/** PDF 본문과 서버가 정한 파일 이름(기간이 들어 있다) */
export interface ReportPdfFile {
  blob: Blob;
  fileName: string;
}

// GET /reports/me/{reportId}/download — PDF 바이너리 다운로드
//
// 파일 이름을 서버 헤더에서 받는 이유: blob 으로 받으면 브라우저가 Content-Disposition 을
// 적용하지 않아 프론트가 이름을 정해야 한다. 서버와 규칙이 갈리지 않도록 값을 받아서 쓴다.
export async function downloadReportPdfFile(
  reportId: number,
): Promise<ReportPdfFile> {
  const res = await api.get<Blob>(`/reports/me/${reportId}/download`, {
    responseType: 'blob',
  });
  const fromHeader = res.headers['x-report-filename'];
  return {
    blob: res.data,
    fileName:
      typeof fromHeader === 'string' && fromHeader
        ? fromHeader
        : `report-${reportId}.pdf`,
  };
}

/**
 * 리포트 생성(POST) 후 COMPLETED/FAILED 가 될 때까지 상태를 폴링한다.
 * 최대 maxTries 회, interval(ms) 간격.
 */
export async function pollReportUntilDone(
  reportId: number,
  {
    interval = 2000,
    maxTries = 30,
  }: { interval?: number; maxTries?: number } = {},
): Promise<ReportDetail> {
  for (let i = 0; i < maxTries; i += 1) {
    const detail = await getReportDetail(reportId);
    if (detail.status === 'COMPLETED' || detail.status === 'FAILED') {
      return detail;
    }
    await delay(interval);
  }
  throw new Error('리포트 생성이 시간 내에 완료되지 않았습니다.');
}

/**
 * GET /reports/me/daily — 기간별 하루 학습 요약. 학습 캘린더가 보고 있는 달(6주 42칸)을
 * 한 번에 받는다.
 *
 * 기록이 없는 날은 응답에 없다 — "0시간 공부한 날"과 "기록이 없는 날"은 다르게 그려야 한다.
 */
export async function getDailyStudy(
  from: string,
  to: string,
): Promise<DailyStudy[]> {
  const { data } = await api.get<DailyStudy[]>('/reports/me/daily', {
    params: { from, to },
  });
  return data;
}
