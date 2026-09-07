// 인증 관련 공용 타입

// 로그인/회원 API 응답의 member 객체
export interface Member {
  memberId: number;
  nickname: string;
  email: string;
  profileImageUrl?: string;
  // MEMBER | ADMIN. 게시판에서 공지·이벤트 작성 버튼 노출 판단에 쓴다.
  // 이 필드가 생기기 전에 로그인해 둔 localStorage에는 없을 수 있으니 optional로 두고,
  // 없으면 일반 회원으로 취급한다(다시 로그인하면 채워진다).
  role?: 'MEMBER' | 'ADMIN';
}

// 로그인 성공 시 받는 데이터 (POST /auth/login 응답)
export interface AuthResult {
  accessToken: string;
  refreshToken: string;
  member: Member;
}

// POST /auth/signup 요청
export interface SignupRequest {
  email: string;
  password: string;
  passwordConfirm: string;
  nickname: string;
}

// POST /auth/signup 응답 (토큰 없음 — 가입만 처리됨)
export interface SignupResponse {
  memberId: number;
  email: string;
  nickname: string;
  createdAt: string;
}

// POST /auth/login 요청
export interface LoginRequest {
  email: string;
  password: string;
}

// PATCH /auth/password 요청 (비밀번호 변경)
export interface PasswordChangeRequest {
  currentPassword: string;
  newPassword: string;
  newPasswordConfirm: string;
}
