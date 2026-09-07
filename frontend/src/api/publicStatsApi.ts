// src/api/publicStatsApi.ts
import { api } from '@/api/client';

/** 지금 공부 중인 인원 — GET /api/v1/public/active-users */
export interface ActiveUsers {
  /** 스터디룸에 들어와 있는 회원 수 */
  activeUserCount: number;
}

/**
 * 지금 공부 중인 인원 수.
 *
 * 로그인 없이 조회할 수 있다. 홈 첫 화면이 비로그인에게 먼저 보이는데, 서비스가 살아 있다는
 * 신호가 필요하기 때문이다. 개인을 특정할 수 있는 값은 담겨 있지 않다.
 *
 * 창을 닫은 사람은 잠시 뒤 정리되므로 그 사이에는 실제보다 조금 크게 나올 수 있다.
 */
export async function getActiveUsers(): Promise<ActiveUsers> {
  const { data } = await api.get<ActiveUsers>('/public/active-users');
  return data;
}
