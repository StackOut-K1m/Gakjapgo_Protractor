import { getMypageSummary } from '@/api/mypageApi';
import { getWeeklyReportSummary } from '@/api/reportApi';
import SectionCard from '@/components/mypage/SectionCard';
import { useAsync } from '@/hooks/useAsync';
import type { ReportDailyStat } from '@/types/report';
import { addDays, thisWeekStart, toDateString } from '@/utils/week';

/**
 * 이번 주 기록과 목표를 한 번에 받아 온다.
 *
 * <p>
 * 일자별 값은 주간 리포트 요약에서 가져온다. 마이페이지 전용 통계 API(/mypage/stats)는
 * 백엔드에 없고, 이 API 가 <b>임의의 주</b>를 받아 기록에서 직접 계산해 주기 때문이다
 * (weekStart 를 넘기면 그 주 월요일로 정규화한다 — ReportService.getSummary 참고).
 * 리포트를 생성하지 않아도 값이 나온다. 생성된 리포트는 aiFeedback 한 줄에만 쓰인다.
 *
 * <p>
 * 목표(분)는 마이페이지 요약에 있다. 예전에는 목 데이터의 goalProgress 를 그대로 썼는데,
 * 그 값은 늘 72 로 고정이라 사용자가 온보딩에서 정한 목표와 아무 상관이 없었다.
 */
async function loadWeek() {
  const [report, summary] = await Promise.all([
    getWeeklyReportSummary({ period: 'WEEKLY', weekStart: thisWeekStart() }),
    getMypageSummary(),
  ]);
  return {
    dailyStats: report.dailyStats,
    weeklyGoalMinutes: summary.weeklyGoalMinutes,
  };
}

const WEEKDAYS = ['월', '화', '수', '목', '금', '토', '일'];

/**
 * 이번 주 월요일부터 오늘까지의 날짜.
 * 아직 오지 않은 요일은 보여주지 않는다 (지난주 결산인 주간 리포트와 달리
 * 여기는 '이번 주 진행 상황'이라 남은 요일 자리가 비어 있으면 오해를 준다).
 */
function weekDatesUntilToday(): string[] {
  const today = new Date();
  const mondayOffset = (today.getDay() + 6) % 7; // 0=월
  const monday = addDays(today, -mondayOffset);
  // toISOString() 은 UTC 라 KST 오전에는 하루 밀린다. toDateString() 을 쓴다.
  return Array.from({ length: mondayOffset + 1 }, (_, i) =>
    toDateString(addDays(monday, i)),
  );
}

interface DayBar {
  label: string;
  isSunday: boolean;
  value: number | null; // 표시값 (시간 또는 %)
  ratio: number; // 0~1 (막대 높이)
}

function StudyGoalsSection() {
  const { data, loading, error } = useAsync(loadWeek, []);

  if (loading)
    return (
      <SectionCard title="🎯 나의 학습 목표">
        <p className="muted">불러오는 중…</p>
      </SectionCard>
    );
  if (error || !data)
    return (
      <SectionCard title="🎯 나의 학습 목표">
        <p className="error">{error ?? '학습 목표를 불러오지 못했습니다.'}</p>
      </SectionCard>
    );

  const week = weekDatesUntilToday();
  const byDate = new Map<string, ReportDailyStat>(
    data.dailyStats.map((d) => [d.date, d]),
  );

  // 주간 목표 카드 — 요일별 학습 시간(시간)
  const hourBars: DayBar[] = week.map((date, i) => {
    const stat = byDate.get(date);
    const hours = stat ? stat.totalStudySeconds / 3600 : null;
    return { label: WEEKDAYS[i], isSunday: i === 6, value: hours, ratio: 0 };
  });
  const maxHours = Math.max(1, ...hourBars.map((b) => b.value ?? 0));
  hourBars.forEach((b) => (b.ratio = b.value ? b.value / maxHours : 0));

  // 아직 오지 않은 요일은 서버가 0 으로 주므로 7일을 다 더해도 값은 같다.
  const weekTotalSeconds = data.dailyStats.reduce(
    (s, d) => s + d.totalStudySeconds,
    0,
  );

  /**
   * 목표 달성률(%). 목표를 정하지 않았으면 null 이고, 그때는 막대만 보여준다.
   *
   * 100 을 넘겨도 자르지 않고 문구로만 보여준다 — 막대는 아래에서 100 으로 가둔다.
   * 목표를 넘긴 사람에게 "100% 달성"만 보여 주면 얼마나 더 했는지가 사라진다.
   */
  const goalProgress =
    data.weeklyGoalMinutes && data.weeklyGoalMinutes > 0
      ? Math.round((weekTotalSeconds / 60 / data.weeklyGoalMinutes) * 100)
      : null;

  // 바른 자세율 카드 — 요일별 자세율(%)
  const postureBars: DayBar[] = week.map((date, i) => {
    const stat = byDate.get(date);
    const ratio = stat ? stat.goodPostureRatio : null;
    return {
      label: WEEKDAYS[i],
      isSunday: i === 6,
      value: ratio,
      ratio: ratio ? ratio / 100 : 0,
    };
  });
  const postureValues = postureBars
    .map((b) => b.value)
    .filter((v): v is number => v !== null);
  const avgPosture = postureValues.length
    ? Math.round(
        postureValues.reduce((s, v) => s + v, 0) / postureValues.length,
      )
    : 0;

  return (
    <SectionCard title="🎯 나의 학습 목표">
      <div className="goals-row">
        <GoalCard
          title="주간 목표"
          meta={
            goalProgress === null
              ? `이번 주 ${formatHM(weekTotalSeconds)} · 목표 미설정`
              : `이번 주 ${formatHM(weekTotalSeconds)} · ${goalProgress}% 달성`
          }
          progress={Math.min(100, goalProgress ?? 0)}
          bars={hourBars}
          formatValue={(h) => `${trimZero(h)}h`}
        />
        <GoalCard
          title="바른 자세율"
          meta={`이번 주 평균 ${avgPosture}%`}
          progress={avgPosture}
          bars={postureBars}
          formatValue={(v) => `${Math.round(v)}%`}
        />
      </div>
    </SectionCard>
  );
}

function GoalCard({
  title,
  meta,
  progress,
  bars,
  formatValue,
}: {
  title: string;
  meta: string;
  progress: number;
  bars: DayBar[];
  formatValue: (v: number) => string;
}) {
  return (
    <div className="goal-card">
      <div className="goal-head">
        <strong className="goal-title">{title}</strong>
        <span className="goal-meta muted small">{meta}</span>
      </div>
      <div className="progress-track">
        <div
          className="progress-fill"
          style={{ width: `${Math.min(100, progress)}%` }}
        />
      </div>
      <div
        className="week-chart"
        style={{ gridTemplateColumns: `repeat(${bars.length}, 1fr)` }}
      >
        {bars.map((b) => (
          <div key={b.label} className="week-day">
            <span className="week-value">
              {b.value === null ? '-' : formatValue(b.value)}
            </span>
            <div className="week-bar-wrap">
              <div
                className={`week-bar${b.value === null ? ' empty' : ''}`}
                style={{ height: `${Math.round(b.ratio * 100)}%` }}
              />
            </div>
            <span className={`week-label${b.isSunday ? ' sun' : ''}`}>
              {b.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * 30초를 기준으로 반올림한다(18분 29초 → 18분, 18분 30초 → 19분).
 * 시를 먼저 떼고 남은 초만 반올림하면 59분 40초가 '0시간 60분'으로 찍히므로,
 * 전체를 분으로 반올림한 뒤에 시·분으로 나눈다.
 */
function formatHM(seconds: number) {
  const totalMinutes = Math.round(Math.max(0, seconds) / 60);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return m > 0 ? `${h}시간 ${m}분` : `${h}시간`;
}

// 3.5 → "3.5", 4.0 → "4"
function trimZero(n: number) {
  return Number(n.toFixed(1)).toString();
}

export default StudyGoalsSection;
