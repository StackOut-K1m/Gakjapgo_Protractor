// src/components/auth/SocialLoginButtons.tsx
//
// 카카오·구글 간편 로그인 버튼.
//
// 로그인 화면과 회원가입 화면이 같은 것을 쓴다. 소셜은 가입과 로그인의 입구가 같아서
// 두 화면에서 하는 일이 완전히 같기 때문이다(백엔드가 처음 온 사람이면 계정을 만들어 준다).
import { API_BASE_URL } from '@/api/client';
import styles from './SocialLoginButtons.module.css';

function KakaoIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden>
      <path
        fill="currentColor"
        d="M9 2C5.13 2 2 4.46 2 7.5c0 1.94 1.28 3.64 3.2 4.62l-.8 2.94a.3.3 0 0 0 .45.33l3.5-2.32c.21.02.43.03.65.03 3.87 0 7-2.46 7-5.6S12.87 2 9 2z"
      />
    </svg>
  );
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden>
      <path
        fill="#4285f4"
        d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62z"
      />
      <path
        fill="#34a853"
        d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18z"
      />
      <path
        fill="#fbbc05"
        d="M3.97 10.72a5.4 5.4 0 0 1 0-3.44V4.95H.96a9 9 0 0 0 0 8.1l3.01-2.33z"
      />
      <path
        fill="#ea4335"
        d="M9 3.58c1.32 0 2.5.46 3.44 1.35l2.58-2.58C13.46.9 11.43 0 9 0A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58z"
      />
    </svg>
  );
}

interface SocialLoginButtonsProps {
  /** 구분선에 넣을 문구. 화면에 따라 '간편 로그인' / '간편 회원가입' 으로 쓴다 */
  label: string;
}

export default function SocialLoginButtons({ label }: SocialLoginButtonsProps) {
  /**
   * 백엔드가 소셜 로그인 페이지로 리다이렉트한다. (GET /auth/oauth/{provider})
   *
   * 끝나면 /oauth/callback 으로 일회용 코드가 돌아오고, 그 화면이 토큰 교환과
   * 온보딩 여부 판단까지 맡는다(OAuthCallbackPage).
   */
  function go(provider: 'kakao' | 'google') {
    window.location.href = `${API_BASE_URL}/auth/oauth/${provider}`;
  }

  return (
    <>
      <div className={styles['divider']}>{label}</div>

      <div className={styles['social-list']}>
        <button
          type="button"
          onClick={() => go('kakao')}
          className={`${styles['social-btn']} ${styles['kakao-btn']}`}
        >
          <KakaoIcon />
          카카오로 시작하기
        </button>
        <button
          type="button"
          onClick={() => go('google')}
          className={`${styles['social-btn']} ${styles['google-btn']}`}
        >
          <GoogleIcon />
          구글로 시작하기
        </button>
      </div>
    </>
  );
}
