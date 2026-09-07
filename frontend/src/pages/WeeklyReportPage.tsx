// src/pages/WeeklyReportPage.tsx
//
// 한 주(월~일) 자세 데이터를 한 장으로 정리해 보여주는 리포트 화면.
//
// 리포트 요약을 보는 곳은 여기 하나다. 예전에는 마이페이지에도 같은 카드가 있었는데, 같은 내용이
// 두 화면에 있으니 한쪽만 고치는 일이 생겼다(열람 마감 계산이 실제로 그렇게 어긋나 있었다).
// 마이페이지에서 들어오는 길은 상단 내비게이션에 있다.
import { useState } from 'react';

import {
  createReport,
  downloadReportPdfFile,
  getWeeklyReportSummary,
  pollReportUntilDone,
} from '@/api/reportApi';
import { getApiErrorMessage } from '@/api/client';
import PastReportList from '@/components/report/PastReportList';
import { useAsync } from '@/hooks/useAsync';
import { POSTURE_WINDOW_SECONDS } from '@/hooks/usePostureFrames';
import type {
  BadPostureType,
  PostureBreakdown,
  ReportDailyStat,
  WeeklyReportSummary,
} from '@/types/report';
import {
  formatMonthDay,
  shiftWeek,
  thisWeekRange,
  weekdayLabel,
  type WeekRange,
} from '@/utils/week';
import styles from './WeeklyReportPage.module.css';

/** 도넛 조각의 유형. 화면 표기와 색을 한곳에 모은다 */
type DisplayType = BadPostureType;

/**
 * 서버가 아직 옛 버전이면 새로 추가된 필드(chinRest·phoneUse)가 응답에 없다.
 * 그대로 쓰면 undefined 가 차트 계산에 들어가 NaN 이 되므로 0 으로 받는다.
 */
function countOf(breakdown: PostureBreakdown, key: DisplayType): number {
  return breakdown[key] ?? 0;
}

const POSTURE_TYPES: {
  key: DisplayType;
  label: string;
  color: string;
}[] = [
  { key: 'forwardHead', label: '거북목', color: 'var(--gak-status-danger)' },
  // 라운드숄더가 있던 자리를 그대로 이어받았다(색도 그때 쓰던 값이다).
  { key: 'chinRest', label: '턱 괴기', color: 'var(--gak-status-warning)' },
  { key: 'shoulderTilt', label: '어깨 기울어짐', color: 'var(--gak-accent)' },
  { key: 'otherPosture', label: '기타 자세', color: 'var(--gak-text-muted)' },
  // ↓ 자세가 아니라 집중을 깨는 행동. 둘 다 브라우저가 판정해 세션 종료 시 한 번에 저장된다.
  { key: 'drowsy', label: '졸음/고개 떨굼', color: 'var(--gak-purple)' },
  { key: 'phoneUse', label: '휴대폰 사용', color: 'var(--gak-blue)' },
];

/** '14h 20m' — KPI 카드처럼 자리를 아껴야 하는 곳의 짧은 표기 */
function formatHm(seconds: number) {
  const totalMinutes = Math.round(Math.max(0, seconds) / 60);
  return `${Math.floor(totalMinutes / 60)}h ${String(totalMinutes % 60).padStart(2, '0')}m`;
}

function WeeklyReportPage() {
  // ⚠ 피드백 배포 주간 임시: 처음 열면 이번 주(진행 중)를 본다. 이번 주 데이터로 리포트를
  //   만들 수 있어야 해서 바꿨다 — 끝나면 lastWeekRange() 로 되돌릴 것.
  //   주 이동 버튼이 있으므로 지난주는 그걸로 볼 수 있다.
  const [range, setRange] = useState<WeekRange>(() => thisWeekRange());
  const summary = useAsync(
    () => getWeeklyReportSummary({ period: 'WEEKLY', weekStart: range.start }),
    [range.start],
  );

  // 아직 오지 않은 주는 볼 것이 없다. '다음 주' 버튼을 그때만 막는다.
  const atCurrentWeek = range.start >= thisWeekRange().start;
  const period = `${formatMonthDay(range.start)} ~ ${formatMonthDay(range.end)}`;

  return (
    <div className={styles['page']}>
      <header className={styles['page-head']}>
        <div className={styles['page-head-text']}>
          <span className={styles['kicker']}>
            WEEKLY POSTURE REPORT · {range.start} → {range.end}
          </span>
          <h1 className={styles['page-title']}>
            주간 학습 자세 분석 리포트{' '}
            <span className={styles['page-title-period']}>({period})</span>
          </h1>
          <p className={styles['page-desc']}>
            AI 캠 기반의 주간 자세 데이터 분석 결과와 전문 맞춤 피드백을
            전달합니다.
          </p>
        </div>

        <div className={styles['page-head-actions']}>
          <button
            type="button"
            className={styles['btn-ghost']}
            onClick={() => setRange((r) => shiftWeek(r, -1))}
          >
            ← 지난 주간 리포트
          </button>
          <button
            type="button"
            className={styles['btn-ghost']}
            onClick={() => setRange((r) => shiftWeek(r, 1))}
            disabled={atCurrentWeek}
          >
            다음 주 →
          </button>
        </div>
      </header>

      {summary.loading && <p className={styles['state']}>불러오는 중…</p>}
      {summary.error && (
        <p className={styles['state']} data-error="true">
          {summary.error}
        </p>
      )}

      {summary.data && (
        <div className={styles['content']}>
          <KpiRow summary={summary.data} />

          <div className={styles['grid-2']}>
            <BarChartCard
              title="일별 총 학습시간"
              unit="시간"
              stats={summary.data.dailyStats}
              valueOf={(d) => d.totalStudySeconds / 3600}
              format={(v) => `${Math.round(v * 10) / 10}h`}
            />
            <BarChartCard
              title="바른 자세 유지율 추이"
              unit="%"
              stats={summary.data.dailyStats}
              // 기록이 없는 날은 서버가 null 을 준다 — 0% 와 구분해서 '-' 로 표시한다.
              valueOf={(d) => d.goodPostureRatio}
              format={(v) => `${Math.round(v)}%`}
              tone="ratio"
            />
          </div>

          {/*
            AI 종합 피드백·일별 신호 타임라인·개선이 필요한 순간을 뺐다(2026-08 개편).
            앞의 둘은 같은 수치를 문장과 그림으로 한 번 더 말하고 있었고, 마지막 것은
            실제 캡처가 없어 예시 그림만 늘어놓는 자리였다.
            LLM 소견은 계속 만들어지고 PDF 리포트 안에 들어간다.
          */}
          <div className={styles['grid-2']}>
            <DonutCard summary={summary.data} />
            <HourlyCard summary={summary.data} />
          </div>

          {/*
            지난 리포트 목록(다운로드). 리포트를 보러 온 화면에서 지난 주차를 받으려고
            다른 화면으로 돌아가야 하는 것이 어색해 여기 둔다.
          */}
          <PastReportList />

          {/*
            처음 보는 사용자가 "유지율이 뭐지? 집중률이 뭐지?"에서 막히지 않게, 이 화면과 PDF에
            등장하는 지표의 정의·계산식을 한곳에 모아둔다. 문구를 바꾸면 PDF 각주
            (ReportPdfRenderer.metricLegend)·계산 코드(StudyRecordService)와 어긋나지 않는지 볼 것.
          */}
          <Glossary />

          <DownloadRow from={summary.data.weekStart} to={summary.data.weekEnd} />
        </div>
      )}
    </div>
  );
}

/* ── KPI 4장 ───────────────────────────────────────────────── */

interface KpiProps {
  label: string;
  value: string;
  tone?: 'ok' | 'warn' | 'danger';
  delta?: string | null;
  deltaGood?: boolean;
}

function Kpi({ label, value, tone, delta, deltaGood }: KpiProps) {
  return (
    <div className={styles['kpi']}>
      <span className={styles['kpi-label']}>{label}</span>
      <span className={styles['kpi-value']} data-tone={tone}>
        {value}
      </span>
      {delta && (
        <span className={styles['kpi-delta']} data-good={deltaGood}>
          {delta}
        </span>
      )}
    </div>
  );
}

/** 전주 대비 증감 문구. 전주 기록이 없으면(null) 비교하지 않는다 — 가짜 개선 방지 */
function deltaText(
  cur: number | null,
  prev: number | null,
  unit: string,
): string | null {
  if (cur === null || prev === null) return null;
  const diff = cur - prev;
  if (diff === 0) return `전주와 같음`;
  return `${diff > 0 ? '▲' : '▼'} ${Math.abs(diff)}${unit}`;
}

function KpiRow({ summary }: { summary: WeeklyReportSummary }) {
  const warnDiff = summary.warningCount - summary.prevWeek.warningCount;
  const grade =
    summary.totalScore === null
      ? null
      : summary.totalScore >= 85
        ? '우수 (85점 이상)'
        : summary.totalScore >= 70
          ? '양호 (70점 이상)'
          : '경고 (70점 미만)';

  return (
    <div className={styles['kpi-row']}>
      <Kpi
        label="순공부 시간"
        value={formatHm(summary.focusedSeconds)}
        delta={
          // 전주 순공부 시간은 응답에 없다 — 목표 대비 달성률을 대신 보여준다.
          summary.goalAchievementRate !== null
            ? `주간 목표 ${summary.goalAchievementRate}%`
            : null
        }
        deltaGood={(summary.goalAchievementRate ?? 0) >= 100}
      />
      <Kpi
        label="바른 자세 유지율"
        value={
          summary.goodPostureRatio === null
            ? '-'
            : `${summary.goodPostureRatio}%`
        }
        tone="ok"
        delta={deltaText(
          summary.goodPostureRatio,
          summary.prevWeek.goodPostureRatio,
          '%p',
        )}
        deltaGood={
          (summary.goodPostureRatio ?? 0) >=
          (summary.prevWeek.goodPostureRatio ?? 0)
        }
      />
      <Kpi
        label="유해 자세 감지"
        value={`${summary.postureBreakdown.total}회`}
        tone="danger"
        delta={
          // 전주 감지가 0이면 비교할 기준이 없다(첫 주마다 "▲ N회"가 붙는다)
          summary.prevWeek.warningCount > 0 && warnDiff !== 0
            ? `경고 ${warnDiff > 0 ? '▲' : '▼'} ${Math.abs(warnDiff)}회`
            : null
        }
        deltaGood={warnDiff < 0}
      />
      <Kpi
        label="자세 종합 점수"
        value={summary.totalScore === null ? '-' : `${summary.totalScore}점`}
        tone="warn"
        delta={grade}
        deltaGood={(summary.totalScore ?? 0) >= 85}
      />
    </div>
  );
}

/* ── 요일별 막대 그래프 ─────────────────────────────────────── */

interface BarChartCardProps {
  title: string;
  unit: string;
  stats: ReportDailyStat[];
  /** null 이면 기록이 없는 날이라 막대를 그리지 않는다 */
  valueOf: (stat: ReportDailyStat) => number | null;
  format: (value: number) => string;
  tone?: 'hours' | 'ratio';
}

function BarChartCard({
  title,
  unit,
  stats,
  valueOf,
  format,
  tone = 'hours',
}: BarChartCardProps) {
  const values = stats.map(valueOf);
  // 가장 큰 막대가 그래프 높이를 꽉 채우도록 상대 비율로 그린다.
  const max = Math.max(...values.map((v) => v ?? 0), 1);

  return (
    <section className={styles['card']}>
      <h2 className={styles['card-title']}>
        {title} <span className={styles['card-unit']}>({unit})</span>
      </h2>
      {/*
        막대 높이가 값에 정비례해야 한다. 라벨을 막대와 같은 칸에 두면 라벨이 차지한 높이만큼
        막대가 짧아져서, 값이 두 배인 막대가 두 배로 보이지 않는다. 그래서 측정 구간(.bar-track)
        안에는 막대만 두고 숫자·요일은 그 바깥에 둔다.
      */}
      <div className={styles['bars']}>
        {stats.map((stat, i) => {
          const value = values[i];
          return (
            <div key={stat.date} className={styles['bar-item']}>
              <div className={styles['bar-track']}>
                <div
                  className={styles['bar']}
                  data-tone={tone}
                  data-empty={value === null || value === 0}
                  style={{ height: `${((value ?? 0) / max) * 100}%` }}
                />
              </div>
              <span className={styles['bar-value']} data-empty={value === null}>
                {value === null ? '-' : format(value)}
              </span>
              <span className={styles['bar-label']}>
                {weekdayLabel(stat.date)}
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}

/* ── 주로 공부하는 시간대 ───────────────────────────────────── */

/** 24칸(시간별)을 2시간 단위 12칸으로 접는다. 7일 치를 한 화면에 놓기엔 24줄은 너무 길다 */
function twoHourBuckets(hourly: number[]) {
  return Array.from({ length: 12 }, (_, i) => ({
    label: `${String(i * 2).padStart(2, '0')} – ${String(i * 2 + 2).padStart(2, '0')}시`,
    minutes: (hourly[i * 2] ?? 0) + (hourly[i * 2 + 1] ?? 0),
  }));
}

function HourlyCard({ summary }: { summary: WeeklyReportSummary }) {
  const all = twoHourBuckets(summary.hourlyFocusMinutes ?? []);
  const first = all.findIndex((b) => b.minutes > 0);
  const last = all.findLastIndex((b) => b.minutes > 0);
  // 기록이 있는 구간만 잘라서 보여준다. 새벽 4시대처럼 늘 비는 줄까지 12줄을 다 늘어놓으면
  // 정작 어디에 몰려 있는지가 안 보인다.
  const buckets = first === -1 ? [] : all.slice(first, last + 1);
  const max = Math.max(...buckets.map((b) => b.minutes), 1);
  const peak = buckets.find((b) => b.minutes === max);

  return (
    <section className={styles['card']}>
      <div className={styles['card-head']}>
        <h2 className={styles['card-title']}>주로 공부하는 시간대</h2>
        <span className={styles['card-note']}>주간 누적 · 분</span>
      </div>

      {buckets.length === 0 ? (
        <p className={styles['state']}>이 주에는 학습 기록이 없습니다.</p>
      ) : (
        <>
          <div className={styles['hour-rows']}>
            {buckets.map((b) => (
              <div key={b.label} className={styles['hour-row']}>
                <span className={styles['hour-label']}>{b.label}</span>
                <div className={styles['hour-track']}>
                  <div
                    className={styles['hour-fill']}
                    data-peak={b.minutes === max}
                    style={{ width: `${(b.minutes / max) * 100}%` }}
                  />
                </div>
                <span
                  className={styles['hour-value']}
                  data-peak={b.minutes === max}
                >
                  {Math.floor(b.minutes / 60)}h{' '}
                  {String(b.minutes % 60).padStart(2, '0')}m
                </span>
              </div>
            ))}
          </div>
          {peak && (
            <div className={styles['card-footnote']}>
              <span className={styles['card-footnote-lead']}>
                가장 오래 앉아 있는 구간은 {peak.label}입니다
              </span>
              <span className={styles['card-footnote-sub']}>
                방에 있던 시간에 순공부를 고르게 펼쳐 계산한 값이라 실제 분포와
                조금 다를 수 있어요.
              </span>
            </div>
          )}
        </>
      )}
    </section>
  );
}

/* ── 유해 자세 빈도 도넛 ────────────────────────────────────── */

const DONUT_RADIUS = 54;
const DONUT_CIRCUMFERENCE = 2 * Math.PI * DONUT_RADIUS;

function DonutCard({ summary }: { summary: WeeklyReportSummary }) {
  const { postureBreakdown } = summary;
  // 값이 0 인 유형은 조각이 없다 — 연결 대기 중인 유형도 값이 들어오면 자동으로 낀다.
  const slices = POSTURE_TYPES.map((t) => ({
    ...t,
    count: countOf(postureBreakdown, t.key),
  })).filter((s) => s.count > 0);
  // 서버가 합계를 직접 주지만, 조각 합과 어긋나면 비율이 이상해지므로 조각 합을 쓴다.
  const total = slices.reduce((sum, s) => sum + s.count, 0);

  const arcLength = (count: number) =>
    total > 0 ? (count / total) * DONUT_CIRCUMFERENCE : 0;

  const arcs = slices.map((slice, i) => ({
    key: slice.key,
    length: arcLength(slice.count),
    // 각 조각의 시작 위치는 앞선 조각들의 길이 합만큼 뒤로 민다.
    offset: slices
      .slice(0, i)
      .reduce((sum, prev) => sum + arcLength(prev.count), 0),
    color: slice.color,
  }));

  return (
    <section className={styles['card']}>
      <h2 className={styles['card-title']}>주요 유해 자세 빈도분석</h2>
      <div className={styles['donut-body']}>
        <div className={styles['donut']}>
          <svg viewBox="0 0 140 140" width="150" height="150">
            {/* 조각이 하나도 없을 때 빈 원이라도 남겨 자리가 무너지지 않게 한다 */}
            {arcs.length === 0 && (
              <circle
                cx="70"
                cy="70"
                r={DONUT_RADIUS}
                fill="none"
                stroke="rgba(255,255,255,.07)"
                strokeWidth="20"
              />
            )}
            {arcs.map((arc) => (
              <circle
                key={arc.key}
                cx="70"
                cy="70"
                r={DONUT_RADIUS}
                fill="none"
                stroke={arc.color}
                strokeWidth="20"
                strokeDasharray={`${arc.length} ${DONUT_CIRCUMFERENCE}`}
                strokeDashoffset={-arc.offset}
              />
            ))}
          </svg>
          <div className={styles['donut-center']}>
            <span className={styles['donut-center-label']}>총 감지</span>
            <span className={styles['donut-center-value']}>{total}회</span>
          </div>
        </div>

        <ul className={styles['legends']}>
          {slices.length === 0 && (
            <li className={styles['state']}>감지된 유해 자세가 없습니다.</li>
          )}
          {slices.map((slice) => (
            <li key={slice.key} className={styles['legend-item']}>
              <span
                className={styles['legend-swatch']}
                style={{ background: slice.color }}
              />
              <span className={styles['legend-label']}>{slice.label}</span>
              <span className={styles['legend-value']}>
                {Math.round((slice.count / total) * 100)}% ({slice.count}회)
              </span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/* ── 지표 설명 ──────────────────────────────────────────────── */

const GLOSSARY: [string, string][] = [
  [
    '순공부 시간',
    '카메라를 켜고 실제로 집중한 시간이에요. 휴식·자리비움 시간은 들어가지 않아요.',
  ],
  [
    '학습 집중률',
    '순공부 ÷ (순공부 + 자리비움) × 100. 자리에 있어야 했던 시간 중 실제로 집중한 비율이에요. 방이 정한 휴식은 빼고 계산해요.',
  ],
  [
    '바른 자세 유지율',
    `(순공부 − 나쁜 자세 시간) ÷ 순공부 × 100. ${POSTURE_WINDOW_SECONDS}초 미만의 짧은 흐트러짐 시간도 포함돼요.`,
  ],
  [
    '집중을 깬 순간(회)',
    `같은 나쁜 자세가 ${POSTURE_WINDOW_SECONDS}초 이상 이어졌을 때 1회로 확정해요. 그래서 감지가 0회여도 유지율은 100%가 아닐 수 있어요.`,
  ],
  [
    '부위별 자세 점수',
    '(1 − 그 자세였던 시간 ÷ 순공부) × 100. 목 90점이면 공부 시간의 10%를 거북목으로 보냈다는 뜻이에요.',
  ],
  [
    '자세 종합 점수',
    '부위별 점수 3개(목·턱 괴기·어깨 균형)의 평균. 85점 이상 우수, 70점 이상 양호, 그 미만은 경고예요.',
  ],
  [
    '목표 달성률',
    '이번 주 순공부 시간 ÷ 주간 목표(하루 목표 × 7) × 100. 온보딩에서 목표를 정해야 나와요.',
  ],
  [
    '주로 공부하는 시간대',
    '방에 있던 구간에 순공부 시간을 고르게 펼쳐 시간대별로 모은 값이에요. 근사치입니다.',
  ],
];

function Glossary() {
  return (
    <section className={styles['card']}>
      <h2 className={styles['card-title']}>지표 설명</h2>
      <div className={styles['glossary']}>
        {GLOSSARY.map(([term, desc]) => (
          <div key={term} className={styles['glossary-row']}>
            <span className={styles['glossary-term']}>{term}</span>
            <span className={styles['glossary-desc']}>{desc}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ── PDF 다운로드 ───────────────────────────────────────────── */

function DownloadRow({ from, to }: { from: string; to: string }) {
  const [generating, setGenerating] = useState(false);
  const [message, setMessage] = useState('');
  const [failed, setFailed] = useState(false);

  const handleDownload = async () => {
    setGenerating(true);
    setFailed(false);
    setMessage('리포트를 생성하고 있습니다…');
    try {
      const { reportId } = await createReport({
        from,
        to,
        title: `${from} ~ ${to} 주간 학습 자세 분석 리포트`,
      });
      // 서버가 LLM 호출 + PDF 렌더링까지 하므로 목보다 오래 걸린다.
      const detail = await pollReportUntilDone(reportId, {
        interval: 2000,
        maxTries: 30,
      });
      if (detail.status !== 'COMPLETED') {
        throw new Error(detail.errorMessage ?? '리포트 생성에 실패했습니다.');
      }

      // 파일 이름은 서버가 정한 것을 쓴다 — 기간이 들어 있어 어느 주차인지 바로 보인다.
      const { blob, fileName } = await downloadReportPdfFile(reportId);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      a.click();
      URL.revokeObjectURL(url);
      setMessage('리포트를 다운로드했습니다.');
    } catch (e) {
      setFailed(true);
      // 서버가 한글 안내를 담아 보낸다(예: 기록 없는 기간 400 "해당 기간에 학습 기록이 없어…").
      // e.message를 그대로 쓰면 axios의 "Request failed with status code 400"이 노출된다.
      setMessage(getApiErrorMessage(e, '리포트 생성에 실패했습니다.'));
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className={styles['download-row']}>
      <button
        type="button"
        className={styles['download-btn']}
        onClick={handleDownload}
        disabled={generating}
      >
        <svg viewBox="0 0 24 24" aria-hidden width="17" height="17">
          <path
            d="M12 3v12m-5-5 5 5 5-5M5 21h14"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        {generating ? '리포트 생성 중…' : 'PDF로 리포트 다운로드 받기'}
      </button>
      {message && (
        <p className={styles['download-msg']} data-error={failed}>
          {message}
        </p>
      )}
    </div>
  );
}

export default WeeklyReportPage;
