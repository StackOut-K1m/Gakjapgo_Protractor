import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { exchangeOAuthCode } from '@/api/authApi';
import { getApiErrorMessage } from '@/api/client';
import { hasPendingOnboarding } from '@/api/onboardingApi';
import { useAuthStore } from '@/stores/useAuthStore';
import styles from './OAuthCallbackPage.module.css';

/**
 * 소셜 로그인 콜백 화면.
 *
 * 백엔드가 로그인 처리 후 이 주소로 `#code=...` 또는 `#error=...` 를 붙여 보낸다.
 * (토큰이 브라우저 방문기록에 남지 않도록 일회용 코드만 전달된다.)
 *
 * 코드를 토큰으로 교환한 뒤, 온보딩을 마쳤으면 홈으로 아직이면 온보딩으로 보낸다.
 * 소셜은 가입과 로그인의 입구가 같아서 여기서 갈라 주지 않으면 처음 온 사람이
 * 온보딩을 건너뛴 채 홈에 도착한다.
 */
function OAuthCallbackPage() {
  const navigate = useNavigate();
  const setAuth = useAuthStore((state) => state.setAuth);
  // 주소의 #code / #error 는 렌더 중에 한 번만 읽는다.
  const [params] = useState(
    () => new URLSearchParams(window.location.hash.replace(/^#/, '')),
  );
  const code = params.get('code');
  const initialError =
    params.get('error') ?? (code ? '' : '로그인 정보를 확인할 수 없습니다.');

  const [error, setError] = useState(initialError);
  // StrictMode 의 이중 실행으로 일회용 코드를 두 번 쓰지 않도록 막는다.
  const exchangedRef = useRef(false);

  useEffect(() => {
    if (!code || exchangedRef.current) return;
    exchangedRef.current = true;

    exchangeOAuthCode(code)
      .then(async (result) => {
        setAuth(result);
        // 소셜은 가입과 로그인이 같은 버튼이라, 처음 들어온 사람도 이 경로로 온다.
        // 아직 온보딩 전이면 홈이 아니라 온보딩부터 거치게 한다
        // (이메일 가입은 SignupPage 가 같은 일을 한다).
        //
        // setAuth 를 먼저 부르는 것이 중요하다. 토큰이 스토어에 들어가야
        // 아래 요청에 Authorization 헤더가 붙는다.
        const pending = await hasPendingOnboarding();
        navigate(pending ? '/onboarding' : '/', { replace: true });
      })
      .catch((err) => {
        setError(getApiErrorMessage(err, '소셜 로그인에 실패했습니다.'));
      });
  }, [code, navigate, setAuth]);

  return (
    <section className={styles.page}>
      <div className={styles.card}>
        {error ? (
          <>
            <p className={styles.error}>{error}</p>
            <Link to="/login" className={styles.link}>
              로그인 페이지로 돌아가기
            </Link>
          </>
        ) : (
          <p className={styles.message}>로그인 처리 중입니다…</p>
        )}
      </div>
    </section>
  );
}

export default OAuthCallbackPage;
