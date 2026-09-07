// src/components/home/RankingSection.tsx
import type { ChangeEvent } from 'react';

import type { RankingPreviewEntry } from '@/api/rankingApi';
import type { RankingEntry } from '@/types/home';
import styles from './RankingSection.module.css';

// 라벨은 백엔드 RankingWindow 의 구간과 같은 뜻이어야 한다.
// "일주일 전"은 지난주 한 주로 읽히지만 실제 구간은 어제부터 거슬러 7일이라 표현을 맞췄다.
const PERIOD_OPTIONS = [
  { value: 'yesterday', label: '어제' },
  { value: 'week', label: '최근 7일' },
  { value: 'month', label: '최근 30일' },
];

interface RankingSectionProps {
  period: string;
  onPeriodChange: (value: string) => void;
  updatedAt: string;
  myRanking: RankingEntry | null;
  /** 기간별 상위 랭킹. 로그인 없이도 보인다 */
  topRankings: RankingPreviewEntry[];
  isLoggedIn: boolean;
}

/**
 * 초를 "3시간 20분" 으로. 랭킹은 분 단위까지면 충분해서 초는 버린다.
 *
 * 내 순위와 상위 목록이 같은 줄 모양으로 나란히 놓이므로 표기도 같아야 한다.
 * 한쪽만 00:52:30 처럼 찍히면 같은 사람의 같은 기록이 다른 값처럼 보인다.
 */
export function formatRankingTime(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 0) return `${hours}시간 ${minutes}분`;
  return `${minutes}분`;
}

export default function RankingSection({
  period,
  onPeriodChange,
  updatedAt,
  myRanking,
  topRankings,
  isLoggedIn,
}: RankingSectionProps) {
  function handleChange(e: ChangeEvent<HTMLSelectElement>) {
    onPeriodChange(e.target.value);
  }

  return (
    <section className={styles['ranking-section']}>
      <div className={styles['ranking-head']}>
        <h2 className={styles['ranking-title']}>
          <select
            value={period}
            onChange={handleChange}
            aria-label="랭킹 기준 기간"
            className={styles['period-select']}
          >
            {PERIOD_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          누적 공부 시간 랭킹
        </h2>
        {/* "…기준" / "집계 중" 같은 문구 전체를 HomePage 가 넘긴다. 여기서 접미사를 덧붙이면 두 번 찍힌다. */}
        <span className={styles['ranking-updated']}>{updatedAt}</span>
      </div>

      <div className={styles['ranking-body']}>
        {/*
          내 순위를 먼저 보여 준다. 이 화면에서 사람들이 가장 먼저 찾는 값이고, 목록에서
          자기 이름을 눈으로 찾게 하면 10위 밖일 때는 아예 못 찾는다.
        */}
        {/*
          값이 있든 없든 같은 높이의 띠로 둔다. 없을 때만 큰 안내 문단으로 바뀌면 아래 목록과
          리듬이 어긋나서, 순위가 있는데도 "기록이 없어요"가 크게 떠 있는 것처럼 보인다.
        */}
        <div className={styles['ranking-row']} data-mine="true">
          {myRanking ? (
            <>
              <span className={styles['rank-badge']}>{myRanking.rank}위</span>
              <span className={styles['rank-user']}>{myRanking.userName}</span>
              <span className={styles['rank-time']}>{myRanking.studyTime}</span>
            </>
          ) : (
            <span className={styles['mine-empty']}>
              {isLoggedIn
                ? '이 기간에는 내 기록이 없어요'
                : '로그인하면 내 순위도 함께 볼 수 있어요'}
            </span>
          )}
        </div>

        {topRankings.length > 0 ? (
          <div className={styles['ranking-list']}>
            {topRankings.map((entry) => (
              <div key={entry.memberId} className={styles['ranking-row']}>
                <span
                  className={styles['rank-badge']}
                  // 1~3위만 색으로 짚어 준다. 4위부터는 기본색이라 data 속성을 안 붙인다.
                  data-top={entry.rank <= 3 ? entry.rank : undefined}
                >
                  {entry.rank}위
                </span>
                <span className={styles['rank-user']}>{entry.nickname}</span>
                <span className={styles['rank-time']}>
                  {formatRankingTime(entry.focusedSeconds)}
                </span>
              </div>
            ))}
          </div>
        ) : (
          /* 아무도 기록이 없는 기간에만 띄운다. 위의 "내 기록 없음" 띠와 겹치지 않는다 */
          <p className={styles['ranking-empty']}>
            아직 이 기간의 랭킹이 없어요. 첫 스터디를 시작해보세요.
          </p>
        )}
      </div>
    </section>
  );
}