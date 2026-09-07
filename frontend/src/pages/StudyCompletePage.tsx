// src/pages/StudyCompletePage.tsx
import { Navigate, useLocation, useNavigate } from 'react-router-dom';

import TimelapsePlayer from '@/components/study/TimelapsePlayer';
import { POSTURE_WINDOW_SECONDS } from '@/hooks/usePostureFrames';
import { useAuthStore } from '@/stores/useAuthStore';
import type { StudySessionSummary } from '@/types/studyRecord';
import styles from './StudyCompletePage.module.css';

/**
 * 초를 '1시간 20분' 꼴로 바꾼다.
 *
 * 30초를 기준으로 반올림한다 — 18분 29초는 18분, 18분 30초는 19분이다.
 * 예전에는 남는 초를 버려서(내림) 59초를 공부해도 0분으로 보였다.
 * 시·분으로 나누기 전에 전체를 분 단위로 반올림해야 59분 40초가 '1시간'으로 맞아떨어진다.
 */
function formatDuration(seconds: number) {
  const totalMinutes = Math.round(Math.max(0, seconds) / 60);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (h === 0) return `${m}분`;
  return m === 0 ? `${h}시간` : `${h}시간 ${m}분`;
}

/**
 * 바른 자세 유지 비율.
 *
 * 서버가 나쁘다고 읽은 시간을 전체 학습 시간에서 뺀 값이다. 지속 확정과는 기준이 다르다 —
 * 잠깐 흐트러진 것도 여기에는 들어간다. 옆의 타임랩스에 찍힌 빨간 구간과 같은 기준이라야
 * "29% 가 나쁜 자세" 옆에 "나쁜 자세 0분"이 나오는 일이 없다.
 *
 * '실시간 자세 교정 알림'(warningCount)은 그대로 지속 확정 기준이다. "얼마나 오래 나빴나"와
 * "몇 번 경고할 만큼 나빴나"는 다른 질문이라 각자의 기준으로 답한다.
 */
function goodPostureRatio(summary: StudySessionSummary) {
  if (summary.focusedSeconds <= 0) return null;
  const good = summary.focusedSeconds - summary.badPostureSeconds;
  return Math.max(0, Math.round((good / summary.focusedSeconds) * 100));
}

export default function StudyCompletePage() {
  const navigate = useNavigate();
  const location = useLocation();
  const nickname = useAuthStore((s) => s.member?.nickname ?? '');

  const summary = (location.state ?? null) as StudySessionSummary | null;

  // 스터디룸에서 넘어온 게 아니면 보여줄 기록이 없다.
  if (!summary) {
    return <Navigate to="/" replace />;
  }

  const ratio = goodPostureRatio(summary);

  /** 팝업으로 열린 방이면 부모 창을 옮기고 이 창은 닫는다. */
  function openInOpener(path: string) {
    if (window.opener && !window.opener.closed) {
      window.opener.location.href = path;
      window.opener.focus();
      window.close();
      return;
    }
    navigate(path);
  }

  function handleGoHome() {
    if (window.opener && !window.opener.closed) {
      window.close();
      return;
    }
    navigate('/', { replace: true });
  }

  return (
    <div className={styles['complete-page']}>
      <div className={styles['complete-inner']}>
        <header className={styles['headline']}>
          <h1 className={styles['headline-title']}>
            오늘의 학습이 종료되었습니다! 수고하셨습니다. 🎉
          </h1>
          <p className={styles['headline-sub']}>
            {nickname ? `${nickname}님, ` : ''}
            {summary.roomTitle
              ? `'${summary.roomTitle}' 세션 기록이에요.`
              : '이번 세션 기록이에요.'}
          </p>
        </header>

        <div className={styles['content-grid']}>
          <div className={styles['left-col']}>
            <section className={styles['hero-stat']}>
              <p className={styles['hero-label']}>순 공부 시간 / 총 시간</p>
              <p className={styles['hero-value']}>
                {formatDuration(summary.focusedSeconds)}
                <span className={styles['hero-total']}>
                  {' / '}
                  {formatDuration(summary.totalStudySeconds)}
                </span>
              </p>
            </section>

            <TimelapsePlayer
              sessionKey={
                summary.studyRecordId === null
                  ? null
                  : String(summary.studyRecordId)
              }
              consented={summary.timelapseConsent}
            />
          </div>

          <div className={styles['right-col']}>
            <StatBanner
              label="바른 자세 유지 비율"
              value={ratio === null ? '-' : `${ratio}%`}
              note={
                ratio === null
                  ? '학습 시간이 짧아 계산하지 않았어요'
                  : `나쁜 자세 ${formatDuration(summary.badPostureSeconds)}`
              }
            />
            <StatBanner
              label="실시간 자세 교정 알림"
              value={`${summary.postureWarningCount}회`}
              note={`${POSTURE_WINDOW_SECONDS}초 이상 지속된 자세만 세요`}
            />
            <StatBanner
              label="스트레칭 수행"
              value={`${summary.stretchingCount}회`}
              note="경고가 쌓였을 때 진행한 횟수"
            />
          </div>
        </div>

        <div className={styles['actions']}>
          <button
            type="button"
            onClick={() => openInOpener('/mypage')}
            className={styles['report-btn']}
          >
            마이페이지로 가기
          </button>
          <button
            type="button"
            onClick={handleGoHome}
            className={styles['home-btn']}
          >
            홈으로 돌아가기
          </button>
        </div>
      </div>
    </div>
  );
}

interface StatBannerProps {
  label: string;
  value: string;
  note: string;
}

/** 오른쪽 열에 쌓이는 가로형 배너 */
function StatBanner({ label, value, note }: StatBannerProps) {
  return (
    <article className={styles['stat-banner']}>
      <div className={styles['stat-text']}>
        <p className={styles['stat-label']}>{label}</p>
        <p className={styles['stat-note']}>{note}</p>
      </div>
      <p className={styles['stat-value']}>{value}</p>
    </article>
  );
}
