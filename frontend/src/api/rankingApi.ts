import { api } from '@/api/client';

export type RankingPeriod = 'yesterday' | 'week' | 'month';

interface MyRankingResponseDto {
  rank: number | null;
  focusedSeconds: number | null;
  percentile: number | null;
  calculatedAt: string;
  periodStart: string;
  periodEnd: string;
}

/** 랭킹 한 줄. 순위·닉네임·순공 시간만 담는다(개인 식별 정보는 없다). */
export interface RankingPreviewEntry {
  rank: number;
  memberId: number;
  nickname: string;
  focusedSeconds: number;
}

interface RankingPreviewResponseDto {
  rankings: RankingPreviewEntry[];
  calculatedAt: string;
  periodStart: string;
  periodEnd: string;
}

/**
 * 기간별 상위 10명. 로그인 없이 볼 수 있다.
 *
 * 서버가 받는 period 는 대문자(YESTERDAY/WEEK/MONTH)라 여기서 바꿔 보낸다.
 * 화면 쪽 값은 소문자로 통일돼 있어(PERIOD_OPTIONS) 그대로 쓰면 400 이 난다.
 */
export async function getRankingPreview(
  period: RankingPeriod,
): Promise<RankingPreviewResponseDto> {
  const { data } = await api.get<RankingPreviewResponseDto>('/public/rankings/preview', {
    params: { period: period.toUpperCase() },
  });
  return data;
}

export async function getMyRanking(period: RankingPeriod): Promise<MyRankingResponseDto> {
  const { data } = await api.get<MyRankingResponseDto>('/rankings/me', { params: { period } });
  return data;
}
