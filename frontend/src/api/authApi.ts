import { api } from '@/api/client';
import type {
  AuthResult,
  LoginRequest,
  PasswordChangeRequest,
  SignupRequest,
  SignupResponse,
} from '@/types/auth';

// 인증 API 는 백엔드(AuthController)에 모두 구현되어 있어 목 분기 없이 실제로 호출한다.
// 개발 시 백엔드(localhost:8080)가 떠 있어야 로그인/회원가입이 동작한다.

// POST /auth/email/verification-code — 회원가입 인증 코드 발송 (6자리, 5분 유효, 재발송 1분 쿨다운)
export async function sendEmailCode(email: string): Promise<{ message: string }> {
  const { data } = await api.post<{ message: string }>(
    '/auth/email/verification-code',
    { email },
  );
  return data;
}

// POST /auth/email/verify — 인증 코드 확인 (성공 후 30분 안에 가입을 마쳐야 한다)
export async function verifyEmailCode(
  email: string,
  code: string,
): Promise<{ message: string }> {
  const { data } = await api.post<{ message: string }>('/auth/email/verify', {
    email,
    code,
  });
  return data;
}

// POST /auth/signup — 회원가입 (응답에 토큰 없음)
export async function signup(body: SignupRequest): Promise<SignupResponse> {
  const { data } = await api.post<SignupResponse>('/auth/signup', body);
  return data;
}

// POST /auth/login — 로그인 (accessToken/refreshToken/member 반환)
export async function login(body: LoginRequest): Promise<AuthResult> {
  const { data } = await api.post<AuthResult>('/auth/login', body);
  return data;
}

// POST /auth/logout — 서버의 refreshToken 무효화
export async function logout(): Promise<void> {
  await api.post('/auth/logout');
}

// POST /auth/oauth/exchange — 소셜 로그인 일회용 코드를 토큰으로 교환
export async function exchangeOAuthCode(code: string): Promise<AuthResult> {
  const { data } = await api.post<AuthResult>('/auth/oauth/exchange', { code });
  return data;
}

// POST /auth/password/find — 임시 비밀번호 메일 발송
export async function findPassword(email: string): Promise<{ message: string }> {
  const { data } = await api.post<{ message: string }>('/auth/password/find', {
    email,
  });
  return data;
}

// PATCH /auth/password — 비밀번호 변경
export async function changePassword(
  body: PasswordChangeRequest,
): Promise<{ message: string }> {
  const { data } = await api.patch<{ message: string }>('/auth/password', body);
  return data;
}
