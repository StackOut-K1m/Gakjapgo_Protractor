// src/pages/CalendarPage.tsx
import { useCallback, useEffect, useMemo, useState } from 'react';

import { getApiErrorMessage } from '@/api/client';
import { getDailyStudy } from '@/api/reportApi';
import { getSchedules } from '@/api/scheduleApi';
import ScheduleDialog from '@/components/calendar/ScheduleDialog';
import type { DailyStudy } from '@/types/report';
import type { Schedule } from '@/types/schedule';
import {
  WEEKDAY_LABELS,
  buildMonthGrid,
  daysUntil,
  formatDDay,
  shiftMonth,
} from '@/utils/calendar';
import { toDateString } from '@/utils/week';
import styles from './CalendarPage.module.css';

/** 한 칸에 몇 개까지 보여줄지. 넘치면 "+n" 으로 접는다 — 칸 높이가 들쭉날쭉해지기 때문이다. */
const MAX_CHIPS_PER_DAY = 2;

interface DialogState {
  schedule: Schedule | null;
  date: string;
}

/** 초 → '3.5h'. 칸 안에 들어가야 해서 가장 짧은 표기를 쓴다 */
function shortHours(seconds: number) {
  return `${Math.round((seconds / 3600) * 10) / 10}h`;
}

/** 초 → '3시간 24분' */
function longDuration(seconds: number) {
  const minutes = Math.round(seconds / 60);
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}분`;
  return m === 0 ? `${h}시간` : `${h}시간 ${m}분`;
}

export default function CalendarPage() {
  const today = useMemo(() => new Date(), []);
  const todayStr = useMemo(() => toDateString(today), [today]);
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1);
  /** 오른쪽 상세가 보여줄 날짜. 처음에는 오늘 */
  const [selected, setSelected] = useState(todayStr);

  const [dialog, setDialog] = useState<DialogState | null>(null);

  /**
   * 저장·삭제 뒤 목록을 다시 불러오기 위한 카운터.
   *
   * 응답으로 받은 일정을 화면 상태에 직접 끼워 넣지 않는다. 서버가 값을 다듬을 수 있고
   * (제목 trim 등), 무엇보다 다른 창에서 바꾼 일정이 있으면 화면과 서버가 어긋난다.
   */
  const [reloadKey, setReloadKey] = useState(0);

  const cells = useMemo(() => buildMonthGrid(year, month), [year, month]);
  /** 격자 첫 칸~마지막 칸. 학습 기록은 이 범위로 받는다 — 앞뒤 달 칸도 채워야 해서 */
  const gridFrom = cells[0].date;
  const gridTo = cells[cells.length - 1].date;

  /** 지금 보여줘야 할 목록이 무엇인지. 이 값이 바뀌면 다시 불러온다. */
  const requestKey = `${year}-${month}-${reloadKey}`;

  /**
   * 불러온 결과. 요청 키를 같이 들고 있다.
   *
   * loading 을 따로 두지 않는 이유는 효과 안에서 동기 setState 를 하지 않기 위해서다.
   * "무엇을 요청했는지"와 "무엇을 받았는지"를 비교하면 로딩 여부가 저절로 나온다.
   */
  const [loaded, setLoaded] = useState<{
    key: string;
    list: Schedule[];
    study: DailyStudy[];
    error: string | null;
  } | null>(null);

  useEffect(() => {
    let alive = true;
    // 일정과 학습 기록을 함께 기다린다. 따로 넣으면 달을 넘길 때 한쪽만 먼저 바뀌어
    // 잠깐 이전 달 학습량 위에 이번 달 일정이 얹힌 화면이 보인다.
    Promise.all([getSchedules(year, month), getDailyStudy(gridFrom, gridTo)])
      .then(([list, study]) => {
        if (alive) setLoaded({ key: requestKey, list, study, error: null });
      })
      .catch((e) => {
        if (!alive) return;
        setLoaded({
          key: requestKey,
          list: [],
          study: [],
          error: getApiErrorMessage(e, '캘린더를 불러오지 못했습니다.'),
        });
      });
    return () => {
      alive = false;
    };
  }, [year, month, gridFrom, gridTo, requestKey]);

  const fresh = loaded?.key === requestKey;
  const loading = !fresh;
  const error = fresh ? loaded.error : null;
  // 달을 넘기는 동안에는 이전 달 값을 지운다. 남겨 두면 잠깐 다른 달 내용이 붙어 보인다.
  const schedules = useMemo(() => (fresh ? loaded.list : []), [fresh, loaded]);
  const study = useMemo(() => (fresh ? loaded.study : []), [fresh, loaded]);

  /** 날짜 → 그날 일정들. 칸마다 배열을 훑으면 42번 × 일정 수가 되어 미리 묶어 둔다. */
  const byDate = useMemo(() => {
    const map = new Map<string, Schedule[]>();
    for (const s of schedules) {
      const list = map.get(s.targetDate);
      if (list) list.push(s);
      else map.set(s.targetDate, [s]);
    }
    return map;
  }, [schedules]);

  /** 날짜 → 그날 학습 기록. 없는 날은 아예 키가 없다(0시간 공부한 날과 구분) */
  const studyByDate = useMemo(
    () => new Map(study.map((d) => [d.date, d])),
    [study],
  );

  /** 칸 배경 농도의 기준. 그 달에서 가장 많이 공부한 날을 100%로 본다 */
  const maxSeconds = useMemo(
    () => Math.max(...study.map((d) => d.focusedSeconds), 1),
    [study],
  );

  /** D-day 를 켠 일정만, 가까운 순으로. 지난 것은 뺀다. */
  const upcoming = useMemo(
    () =>
      schedules
        .filter((s) => s.dDayEnabled && daysUntil(s.targetDate, today) >= 0)
        .sort((a, b) => a.targetDate.localeCompare(b.targetDate)),
    [schedules, today],
  );

  /** 이번 달 요약. 앞뒤 달 칸은 빼고 보고 있는 달만 센다 */
  const monthSummary = useMemo(() => {
    const prefix = `${year}-${String(month).padStart(2, '0')}-`;
    const days = study.filter((d) => d.date.startsWith(prefix));
    const focused = days.reduce((sum, d) => sum + d.focusedSeconds, 0);
    // 유지율은 순공부로 가중 평균한다 — 10분 공부한 날과 5시간 공부한 날이 같은 무게면 안 된다
    const rated = days.filter((d) => d.goodPostureRatio !== null);
    const weight = rated.reduce((sum, d) => sum + d.focusedSeconds, 0);
    const ratio =
      weight === 0
        ? null
        : Math.round(
            rated.reduce(
              (sum, d) => sum + (d.goodPostureRatio ?? 0) * d.focusedSeconds,
              0,
            ) / weight,
          );
    return {
      studiedDays: days.length,
      ratio,
      focusedHours: Math.round(focused / 3600),
      scheduleCount: schedules.length,
    };
  }, [study, schedules, year, month]);

  const selectedStudy = studyByDate.get(selected);
  const selectedSchedules = byDate.get(selected) ?? [];

  const move = useCallback(
    (delta: number) => {
      const next = shiftMonth(year, month, delta);
      setYear(next.year);
      setMonth(next.month);
    },
    [year, month],
  );

  const goToday = useCallback(() => {
    setYear(today.getFullYear());
    setMonth(today.getMonth() + 1);
    setSelected(todayStr);
  }, [today, todayStr]);

  const closeDialog = useCallback(() => setDialog(null), []);
  const handleSaved = useCallback(() => {
    setDialog(null);
    setReloadKey((k) => k + 1);
  }, []);

  return (
    <div className={styles['calendar-page']}>
      <header className={styles['page-head']}>
        <div className={styles['page-head-text']}>
          <h1 className={styles['page-title']}>학습 캘린더</h1>
          <p className={styles['page-desc']}>
            시험일과 스터디 일정을 등록해 두면 홈에서 D-day 로 보여드려요.
          </p>
        </div>
        <button
          type="button"
          className={styles['add-btn']}
          onClick={() => setDialog({ schedule: null, date: selected })}
        >
          <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden>
            <path
              d="M12 5v14M5 12h14"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
            />
          </svg>
          일정 추가
        </button>
      </header>

      <div className={styles['calendar-inner']}>
        <section className={styles['calendar-card']}>
          <div className={styles['month-bar']}>
            <button
              type="button"
              onClick={() => move(-1)}
              className={styles['nav-btn']}
              aria-label="이전 달"
            >
              ‹
            </button>
            <h2 className={styles['month-label']}>
              {year}년 {month}월
            </h2>
            <button
              type="button"
              onClick={() => move(1)}
              className={styles['nav-btn']}
              aria-label="다음 달"
            >
              ›
            </button>
            <button
              type="button"
              onClick={goToday}
              className={styles['today-btn']}
            >
              오늘
            </button>
            {loading && <span className={styles['loading']}>불러오는 중…</span>}
          </div>

          {error && (
            <p className={styles['error']} role="alert">
              {error}
            </p>
          )}

          <div className={styles['weekday-row']}>
            {WEEKDAY_LABELS.map((label, i) => (
              <span key={label} className={styles['weekday']} data-weekday={i}>
                {label}
              </span>
            ))}
          </div>

          <div className={styles['grid']}>
            {cells.map((cell) => {
              const items = byDate.get(cell.date) ?? [];
              const shown = items.slice(0, MAX_CHIPS_PER_DAY);
              const day = studyByDate.get(cell.date);
              const load = day ? day.focusedSeconds / maxSeconds : 0;
              return (
                <div
                  key={cell.date}
                  className={styles['cell']}
                  data-in-month={cell.inMonth}
                  data-today={cell.isToday}
                  data-selected={cell.date === selected}
                  data-weekday={cell.weekday}
                  // 공부한 만큼 칸이 초록으로 물든다. 달마다 최대치가 달라 상대값으로 칠한다
                  style={{ '--load': load } as React.CSSProperties}
                >
                  <div className={styles['cell-head']}>
                    {/*
                      칸 전체를 버튼으로 만들면 안쪽 일정 버튼이 버튼 안에 들어가 무효한 HTML 이 된다.
                      그래서 날짜 숫자만 버튼으로 두고, 그걸 누르면 오른쪽 상세가 그날로 바뀐다.
                      (일정 추가는 위 '일정 추가' 버튼이 지금 고른 날짜로 연다)
                    */}
                    <button
                      type="button"
                      className={styles['day-num']}
                      onClick={() => setSelected(cell.date)}
                      aria-label={`${cell.date} 선택`}
                      aria-pressed={cell.date === selected}
                    >
                      {cell.day}
                    </button>
                    {day && (
                      <span className={styles['day-hours']}>
                        {shortHours(day.focusedSeconds)}
                      </span>
                    )}
                  </div>

                  <div className={styles['chips']}>
                    {shown.map((s) => (
                      <button
                        key={s.scheduleId}
                        type="button"
                        className={styles['chip']}
                        onClick={() =>
                          setDialog({ schedule: s, date: s.targetDate })
                        }
                        title={s.memo ? `${s.title} · ${s.memo}` : s.title}
                      >
                        <span
                          className={styles['chip-dot']}
                          style={{ background: s.color ?? 'var(--gak-accent)' }}
                          aria-hidden
                        />
                        <span className={styles['chip-title']}>{s.title}</span>
                        {/*
                          D-day 를 켠 일정만 홈 카드와 오른쪽 목록에 나온다. 표시가 없으면
                          "등록은 했는데 왜 홈에 안 뜨지"를 화면만 보고는 알 수 없다.
                        */}
                        {s.dDayEnabled && (
                          <span
                            className={styles['chip-dday']}
                            data-today={daysUntil(s.targetDate, today) === 0}
                          >
                            {formatDDay(s.targetDate, today)}
                          </span>
                        )}
                      </button>
                    ))}
                    {items.length > shown.length && (
                      <span className={styles['more']}>
                        +{items.length - shown.length}
                      </span>
                    )}
                  </div>

                  {/* 학습량 바. 기록이 없는 날은 빈 홈만 남아 '0시간'과 구분된다 */}
                  <div className={styles['load-track']}>
                    <div
                      className={styles['load-fill']}
                      style={{ width: `${Math.round(load * 100)}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <aside className={styles['side']}>
          <section className={styles['detail-card']}>
            <span className={styles['detail-kicker']}>
              {selected.replaceAll('-', '.')}
              {selected === todayStr ? ' · 오늘' : ''}
            </span>
            <h3 className={styles['detail-title']}>
              {selectedStudy
                ? `${longDuration(selectedStudy.focusedSeconds)} 학습`
                : '학습 기록 없음'}
            </h3>

            {selectedSchedules.length > 0 ? (
              <div className={styles['detail-schedules']}>
                {selectedSchedules.map((s) => (
                  <button
                    key={s.scheduleId}
                    type="button"
                    className={styles['detail-schedule']}
                    onClick={() =>
                      setDialog({ schedule: s, date: s.targetDate })
                    }
                  >
                    <span
                      className={styles['dday-dot']}
                      style={{ background: s.color ?? 'var(--gak-accent)' }}
                      aria-hidden
                    />
                    <span className={styles['detail-schedule-title']}>
                      {s.title}
                    </span>
                    {s.dDayEnabled && (
                      <span
                        className={styles['dday-badge']}
                        data-today={daysUntil(s.targetDate, today) === 0}
                      >
                        {formatDDay(s.targetDate, today)}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            ) : (
              <p className={styles['detail-empty']}>등록된 일정이 없습니다.</p>
            )}

            <dl className={styles['detail-rows']}>
              <div className={styles['detail-row']}>
                <dt>순공부 시간</dt>
                <dd>
                  {selectedStudy
                    ? longDuration(selectedStudy.focusedSeconds)
                    : '-'}
                </dd>
              </div>
              <div className={styles['detail-row']}>
                <dt>바른 자세 유지율</dt>
                <dd
                  data-tone={
                    selectedStudy?.goodPostureRatio == null
                      ? 'none'
                      : selectedStudy.goodPostureRatio >= 60
                        ? 'ok'
                        : 'warn'
                  }
                >
                  {selectedStudy?.goodPostureRatio == null
                    ? '-'
                    : `${selectedStudy.goodPostureRatio}%`}
                </dd>
              </div>
              <div className={styles['detail-row']}>
                <dt>참여한 스터디</dt>
                <dd>
                  {selectedStudy && selectedStudy.roomTitles.length > 0
                    ? selectedStudy.roomTitles.join(', ')
                    : '-'}
                </dd>
              </div>
            </dl>
          </section>

          <section className={styles['side-card']}>
            <h3 className={styles['side-title']}>다가오는 D-day</h3>
            {upcoming.length === 0 ? (
              <p className={styles['side-empty']}>
                이 달에 D-day 로 표시한 일정이 없어요. 일정을 등록할 때 “D-day
                표시하기”를 켜면 여기에 나옵니다.
              </p>
            ) : (
              <ul className={styles['dday-list']}>
                {upcoming.map((s) => (
                  <li key={s.scheduleId}>
                    <button
                      type="button"
                      className={styles['dday-item']}
                      onClick={() => setSelected(s.targetDate)}
                    >
                      <span
                        className={styles['dday-dot']}
                        style={{ background: s.color ?? 'var(--gak-accent)' }}
                        aria-hidden
                      />
                      <span className={styles['dday-text']}>
                        <span className={styles['dday-title']}>{s.title}</span>
                        <span className={styles['dday-date']}>
                          {s.targetDate}
                        </span>
                      </span>
                      <span
                        className={styles['dday-badge']}
                        data-today={daysUntil(s.targetDate, today) === 0}
                      >
                        {formatDDay(s.targetDate, today)}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className={styles['side-card']}>
            <h3 className={styles['side-title']}>{month}월 요약</h3>
            <div className={styles['mini-grid']}>
              <Mini value={`${monthSummary.studiedDays}일`} label="학습한 날" />
              <Mini
                value={
                  monthSummary.ratio === null ? '-' : `${monthSummary.ratio}%`
                }
                label="평균 유지율"
                tone="ok"
              />
              <Mini
                value={`${monthSummary.focusedHours}h`}
                label="누적 순공부"
              />
              <Mini
                value={`${monthSummary.scheduleCount}건`}
                label="등록된 일정"
                tone="warn"
              />
            </div>
          </section>
        </aside>
      </div>

      {dialog && (
        <ScheduleDialog
          schedule={dialog.schedule}
          defaultDate={dialog.date}
          onClose={closeDialog}
          onSaved={handleSaved}
        />
      )}
    </div>
  );
}

function Mini({
  value,
  label,
  tone,
}: {
  value: string;
  label: string;
  tone?: 'ok' | 'warn';
}) {
  return (
    <div className={styles['mini']}>
      <span className={styles['mini-value']} data-tone={tone}>
        {value}
      </span>
      <span className={styles['mini-label']}>{label}</span>
    </div>
  );
}
