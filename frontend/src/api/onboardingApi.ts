import axios from 'axios';

import { api } from '@/api/client';
import type {
  OnboardingMe,
  OnboardingOptions,
  OnboardingSaveRequest,
  OnboardingSaveResponse,
  OnboardingUpdateRequest,
} from '@/types/onboarding';

// 온보딩 API는 전부 인증이 필요하다. 회원가입 직후 자동 로그인까지 끝난 상태에서 호출한다.

/** GET /onboarding/options — 목적·관심 태그·동의 항목 선택지 */
export async function getOnboardingOptions(): Promise<OnboardingOptions> {
  const { data } = await api.get<OnboardingOptions>('/onboarding/options');
  return data;
}

/**
 * POST /onboarding — 온보딩 저장(최초 1회).
 * 이미 완료한 회원이 다시 호출하면 409 를 던진다. 그때는 수정 API를 써야 한다.
 */
export async function saveOnboarding(
  body: OnboardingSaveRequest,
): Promise<OnboardingSaveResponse> {
  const { data } = await api.post<OnboardingSaveResponse>('/onboarding', body);
  return data;
}

/** GET /onboarding/me — 내 온보딩 정보. onboardingCompletedAt 이 null 이면 아직 안 한 것이다. */
export async function getMyOnboarding(): Promise<OnboardingMe> {
  const { data } = await api.get<OnboardingMe>('/onboarding/me');
  return data;
}

/**
 * 아직 온보딩을 마치지 않았는가. 로그인 직후 어디로 보낼지 정하는 데 쓴다.
 *
 * 두 가지를 모두 "안 한 것"으로 본다.
 *   - 404 — 설정 행 자체가 없다. 소셜로 처음 들어온 사람이 여기 해당한다
 *   - onboardingCompletedAt 이 null — 행은 있는데 아직 완료 전이다
 *
 * 그 밖의 오류에서는 false 를 준다. 서버가 잠깐 흔들렸다고 온보딩으로 보내면
 * 이미 마친 사람이 온보딩을 다시 보게 되는데, 그게 홈으로 보내는 것보다 나쁘다.
 */
export async function hasPendingOnboarding(): Promise<boolean> {
  try {
    const me = await getMyOnboarding();
    return me.onboardingCompletedAt === null;
  } catch (e) {
    return axios.isAxiosError(e) && e.response?.status === 404;
  }
}

/**
 * PATCH /onboarding/me — 보낸 필드만 부분 수정.
 *
 * 온보딩을 한 번도 저장하지 않은 회원에게는 404 를 던진다(설정 행 자체가 없음).
 * 호출부에서 "온보딩 먼저" 안내로 처리해야 한다.
 *
 * goalMinutes 는 0 을 보내면 "목표 해제"다.
 */
export async function updateMyOnboarding(
  body: OnboardingUpdateRequest,
): Promise<{ memberId: number; updatedAt: string }> {
  const { data } = await api.patch<{ memberId: number; updatedAt: string }>(
    '/onboarding/me',
    body,
  );
  return data;
}
