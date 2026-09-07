import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import type { AuthResult, Member } from '@/types/auth';

interface AuthState {
  // 상태
  accessToken: string | null;
  refreshToken: string | null;
  member: Member | null;

  // 액션
  setAuth: (result: AuthResult) => void; // 로그인 성공 시
  setAccessToken: (accessToken: string) => void; // 토큰 갱신 시
  clearAuth: () => void; // 로그아웃 시
}

/**
 * 인증 전역 상태.
 *
 * - persist 미들웨어로 localStorage에 저장 → 새로고침해도 로그인 유지.
 * - 컴포넌트 밖(axios 인터셉터 등)에서는 useAuthStore.getState() 로 접근.
 */
export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      accessToken: null,
      refreshToken: null,
      member: null,

      setAuth: ({ accessToken, refreshToken, member }) =>
        set({ accessToken, refreshToken, member }),

      setAccessToken: (accessToken) => set({ accessToken }),

      clearAuth: () =>
        set({ accessToken: null, refreshToken: null, member: null }),
    }),
    {
      name: 'auth-storage', // localStorage 키 이름
    },
  ),
);

// 로그인 여부를 간편하게 확인하는 셀렉터 훅
export const useIsLoggedIn = () =>
  useAuthStore((state) => Boolean(state.accessToken));
