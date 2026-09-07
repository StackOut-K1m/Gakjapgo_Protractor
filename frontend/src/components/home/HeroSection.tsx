// src/components/home/HeroSection.tsx
import { useEffect, useState } from 'react';

import type { ExamCountdown, HomeSummary } from '@/types/home';
import { ClockIcon, FlameIcon } from './icons';
import styles from './HeroSection.module.css';

/** 한 장을 얼마나 띄워 둘지. 제목·메모를 읽기엔 충분하고, 다음 장까지 기다리기엔 지루하지 않은 길이. */
const SLIDE_MILLIS = 5000;

interface HeroSectionProps {
  summary: HomeSummary;
  /** D-day 를 켠 일정들. 비어 있으면 등록 안내로 바뀐다. 2개 이상이면 한 장씩 넘어간다. */
  exams: ExamCountdown[];
  todayText: string;
  goalText: string;
  onManageSchedule: () => void;
}

export default function HeroSection({
  summary,
  exams,
  todayText,
  goalText,
  onManageSchedule,
}: HeroSectionProps) {
  /**
   * 지금 보여 주는 장. 목록 길이로 나눠 쓰기 때문에 계속 커져도 된다.
   *
   * 범위를 넘지 않게 여기서 자르지 않고 아래에서 나머지 연산으로 접는다. 일정이 지나
   * 목록이 줄어들 때 효과 안에서 인덱스를 되돌리는 코드를 두지 않으려는 것이다.
   */
  const [slide, setSlide] = useState(0);
  /** 읽는 중에 넘어가지 않게 마우스를 올리거나 초점이 들어오면 멈춘다. */
  const [paused, setPaused] = useState(false);

  const count = exams.length;
  // 앞으로 넘기면 음수가 되므로 한 번 더 더해서 접는다. JS 의 % 는 음수를 그대로 돌려준다.
  const active = count > 0 ? ((slide % count) + count) % count : 0;
  const current = exams[active] ?? null;

  useEffect(() => {
    if (count < 2 || paused) return;
    const timer = window.setInterval(() => setSlide((n) => n + 1), SLIDE_MILLIS);
    return () => window.clearInterval(timer);
    // slide 를 넣어 둔 건, 화살표로 넘긴 직후 남은 시간만큼 있다가 또 넘어가지 않게
    // 타이머를 다시 세기 위해서다. 손으로 넘겼으면 거기서부터 5초를 준다.
  }, [count, paused, slide]);

  /** 마우스를 올리거나 초점이 들어오면 자동 넘김을 멈춘다. 슬라이드와 화살표 양쪽에 건다. */
  const pauseProps = {
    onMouseEnter: () => setPaused(true),
    onMouseLeave: () => setPaused(false),
    onFocus: () => setPaused(true),
    onBlur: () => setPaused(false),
  };

  return (
    <section className={styles['hero']}>
      <div className={styles['hero-greeting']}>
        <h2 className={styles['greeting-title']}>
          안녕하세요, {summary.userName}님 👋
        </h2>
        <p className={styles['greeting-sub']}>
          <span className={styles['online-dot']} aria-hidden />
          오늘도 어제의 나를 이겨봐요. 지금{' '}
          <strong>{summary.onlineCount.toLocaleString()}명</strong>이 함께 공부
          중이에요.
        </p>
      </div>

      <div className={styles['hero-grid']}>
        <article className={styles['exam-card']}>
          <div className={styles['exam-top']}>
            <span className={styles['exam-badge']}>
              {current ? current.badge : '다가오는 일정'}
            </span>
            <div className={styles['exam-today']}>
              <span className={styles['exam-today-label']}>오늘 누적</span>
              <span className={styles['exam-today-value']}>
                {todayText}
                <span className={styles['exam-today-goal']}>/ {goalText}</span>
              </span>
            </div>
          </div>

          {/*
            등록한 D-day 일정이 없어도 카드 자체는 남긴다. 오늘 누적 시간과 '일정 관리' 버튼이
            같이 들어 있어서, 카드를 통째로 감추면 그 두 개도 같이 사라진다.
          */}
          {count > 0 ? (
            <div className={styles['exam-viewport']} {...pauseProps}>
              <div
                className={styles['exam-track']}
                style={{ transform: `translateX(-${active * 100}%)` }}
              >
                {exams.map((exam, i) => (
                  <div
                    key={exam.id}
                    className={styles['exam-slide']}
                    // 화면 밖 장은 읽어 주지 않는다. 안 그러면 일정 제목이 줄줄이 읽힌다.
                    aria-hidden={i !== active}
                  >
                    <h3 className={styles['exam-title']}>
                      {exam.title}까지{' '}
                      <span className={styles['exam-dday']}>{exam.dDayText}</span>
                    </h3>
                    <p className={styles['exam-message']}>{exam.message}</p>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <>
              <h3 className={styles['exam-title']}>D-day 일정이 없어요</h3>
              {/*
                "일정을 등록하세요" 로만 쓰면, 일정을 이미 등록한 사람이 왜 안 나오는지 모른다.
                실제로 빠지는 이유는 대부분 D-day 체크가 꺼져 있어서다.
              */}
              <p className={styles['exam-message']}>
                일정 관리에서 날짜를 등록하고 “D-day 표시하기”를 켜면 남은 날짜가 여기에
                나와요.
              </p>
            </>
          )}

          <div className={styles['exam-bottom']}>
            {/* 한 장뿐이면 통째로 숨긴다. 넘길 데가 없는데 화살표가 있으면 눌러도 안 바뀐다 */}
            {count > 1 && (
              <div className={styles['exam-nav']} {...pauseProps}>
                <button
                  type="button"
                  className={styles['exam-arrow']}
                  onClick={() => setSlide((n) => n - 1)}
                  aria-label="이전 일정"
                >
                  ‹
                </button>
                <div className={styles['exam-dots']}>
                  {exams.map((exam, i) => (
                    <button
                      key={exam.id}
                      type="button"
                      className={styles['exam-dot']}
                      data-active={i === active}
                      aria-label={`${exam.title} ${exam.dDayText}`}
                      aria-current={i === active}
                      onClick={() => setSlide(i)}
                    />
                  ))}
                </div>
                <button
                  type="button"
                  className={styles['exam-arrow']}
                  onClick={() => setSlide((n) => n + 1)}
                  aria-label="다음 일정"
                >
                  ›
                </button>
              </div>
            )}
            <button
              type="button"
              onClick={onManageSchedule}
              className={styles['exam-action']}
            >
              일정 관리
            </button>
          </div>
        </article>

        <article className={styles['stat-card']}>
          <p className={styles['stat-label']}>
            <FlameIcon />
            연속 학습
          </p>
          <p className={styles['stat-value']}>{summary.streakDays}일째</p>
          <p className={styles['stat-note']} data-accent>
            {summary.streakNote}
          </p>
        </article>

        <article className={styles['stat-card']}>
          <p className={styles['stat-label']}>
            <ClockIcon />
            이번 주 공부
          </p>
          <p className={styles['stat-value']}>{summary.weeklyStudyText}</p>
          <p className={styles['stat-note']}>{summary.weeklyStudyNote}</p>
        </article>
      </div>
    </section>
  );
}
