import axios, { AxiosError, type InternalAxiosRequestConfig } from 'axios';

import { useAuthStore } from '@/stores/useAuthStore';

const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '/api/v1';

// 소셜 로그인처럼 axios 가 아니라 브라우저를 직접 이동시켜야 할 때 사용
export const API_BASE_URL = BASE_URL;

// 앱 전체가 공유하는 공통 axios 인스턴스
export const api = axios.create({
  baseURL: BASE_URL,
  timeout: 10000,
  headers: { 'Content-Type': 'application/json' },
});

// ─────────────────────────────────────────────
// 요청 인터셉터: 나가는 모든 요청에 accessToken 자동 첨부
// ─────────────────────────────────────────────
api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().accessToken;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  /*
   * 파일을 보낼 때는 Content-Type 을 지워야 한다.
   *
   * 위 인스턴스 기본값이 application/json 이라, FormData 를 실어 보내도 그 헤더가 그대로
   * 나간다. 서버는 본문이 multipart 인 줄 모르고 "Current request is not a multipart
   * request" 로 거절한다 — 글은 등록되고 첨부만 조용히 실패하는 모양이 된다.
   *
   * 직접 multipart/form-data 로 바꿔 쓸 수는 없다. 그 헤더에는 본문을 나누는 boundary 가
   * 같이 들어가야 하는데 그 값은 브라우저만 안다. 헤더를 비워 두면 브라우저가 boundary 까지
   * 채워서 만들어 준다.
   */
  if (config.data instanceof FormData) {
    config.headers.delete('Content-Type');
  }

  return config;
});

// ─────────────────────────────────────────────
// 토큰 갱신 (POST /auth/refresh)
// 동시에 여러 요청이 401이 나도 refresh는 한 번만 실행되도록 공유 Promise 사용
// ─────────────────────────────────────────────
let refreshPromise: Promise<string> | null = null;

async function refreshAccessToken(): Promise<string> {
  const { refreshToken } = useAuthStore.getState();
  if (!refreshToken) {
    throw new Error('refreshToken 이 없습니다.');
  }

  // 인터셉터 무한 재귀를 피하려고 순수 axios(인스턴스 X)로 호출
  const { data } = await axios.post(`${BASE_URL}/auth/refresh`, {
    refreshToken,
  });

  // 새 토큰을 스토어에 반영 (refreshToken 도 회전되면 함께 갱신)
  useAuthStore.setState({
    accessToken: data.accessToken,
    refreshToken: data.refreshToken ?? refreshToken,
  });
  return data.accessToken as string;
}

/**
 * 액세스 토큰 갱신. 동시에 여러 번 불러도 실제 요청은 한 번만 나간다.
 *
 * axios 401 재시도뿐 아니라 WebSocket 재연결도 이 함수를 쓴다.
 * WebSocket 은 REST 를 거치지 않아서, 방에 가만히 있으면 토큰이 만료돼도
 * 갱신될 기회가 없기 때문이다(액세스 토큰 1시간 / 공부 시간은 그보다 길다).
 */
export function refreshAuthToken(): Promise<string> {
  return (refreshPromise ??= refreshAccessToken().finally(() => {
    refreshPromise = null;
  }));
}

// ─────────────────────────────────────────────
// 응답 인터셉터: 401 → 토큰 갱신 후 원요청 재시도, 실패 시 로그아웃
// ─────────────────────────────────────────────
api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const original = error.config as InternalAxiosRequestConfig & {
      _retry?: boolean;
    };

    // 401 이고, 아직 재시도 안 했을 때만 갱신 시도
    if (error.response?.status === 401 && original && !original._retry) {
      original._retry = true;
      try {
        // 여러 요청이 동시에 401 나도 refresh 는 한 번만 (공유 Promise)
        const newToken = await refreshAuthToken();

        original.headers.Authorization = `Bearer ${newToken}`;
        return api(original); // 실패했던 원래 요청 재시도
      } catch (refreshError) {
        // 갱신도 실패 → 로그아웃 처리 후 로그인 페이지로
        useAuthStore.getState().clearAuth();
        window.location.href = '/login';
        return Promise.reject(refreshError);
      }
    }

    return Promise.reject(error);
  },
);

// ─────────────────────────────────────────────
// 에러 메시지 추출
// 백엔드는 실패 시 { status, message } 형태(ErrorResponse)로 응답한다.
// 서버가 안 떠 있는 등 응답 자체가 없을 때는 fallback 문구를 쓴다.
// ─────────────────────────────────────────────
export function getApiErrorMessage(error: unknown, fallback: string): string {
  if (axios.isAxiosError(error)) {
    const message = (error.response?.data as { message?: string } | undefined)
      ?.message;
    if (message) return message;
    if (!error.response) {
      return '서버에 연결할 수 없습니다. 잠시 후 다시 시도해 주세요.';
    }
  }
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

export default api;
