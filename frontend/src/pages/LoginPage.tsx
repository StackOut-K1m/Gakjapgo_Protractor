import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';

import { login } from '@/api/authApi';
import { getApiErrorMessage } from '@/api/client';
import { hasPendingOnboarding } from '@/api/onboardingApi';
import SocialLoginButtons from '@/components/auth/SocialLoginButtons';
import { useAuthStore } from '@/stores/useAuthStore';
import logoImg from '@/assets/logo.png';
import styles from './LoginPage.module.css';

interface LocationState {
  from?: { pathname: string };
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const setAuth = useAuthStore((state) => state.setAuth);
  const member = useAuthStore((state) => state.member);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // ProtectedRoute 가 기록해둔 "원래 가려던 경로" (없으면 홈으로)
  const from = (location.state as LocationState)?.from?.pathname ?? '/';

  // 이미 로그인된 상태면 로그인 화면을 보여줄 필요가 없다
  if (member) {
    return <Navigate to={from} replace />;
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError('');

    if (!email.trim() || !password) {
      setError('이메일과 비밀번호를 모두 입력해 주세요.');
      return;
    }
    if (!EMAIL_PATTERN.test(email.trim())) {
      setError('올바른 이메일 형식이 아닙니다.');
      return;
    }

    setSubmitting(true);
    try {
      const result = await login({ email: email.trim(), password });
      setAuth(result);
      // 온보딩을 아직 안 했으면 그쪽이 먼저다. 온보딩 없이는 감지 동의도 목표 시간도 없어서
      // 어느 화면으로 보내도 빈 값만 보인다.
      //
      // 원래 가려던 곳(from)은 여기서 잃는다. 온보딩을 마치면 홈으로 간다 —
      // 온보딩을 건너뛰고 목적지로 돌려보내려면 그 경로를 온보딩까지 들고 가야 하는데,
      // 처음 한 번뿐인 흐름에 그만한 복잡도를 들일 이유가 없다.
      //
      // setAuth 를 먼저 부르는 것이 중요하다. 토큰이 스토어에 들어가야
      // 아래 요청에 Authorization 헤더가 붙는다.
      const pending = await hasPendingOnboarding();
      navigate(pending ? '/onboarding' : from, { replace: true });
    } catch (err) {
      setError(getApiErrorMessage(err, '로그인에 실패했습니다.'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className={styles.page}>
      <div className={styles.card}>
        <div className={styles.brand}>
          <img src={logoImg} alt="" className={styles.logoImg} />
          <h1 className={styles.wordmark}>각잡고</h1>
          <p className={styles.tagline}>목표를 함께 이루는 똑똑한 학습 파트너</p>
        </div>

        <form className={styles.form} onSubmit={handleSubmit} noValidate>
          <div className={styles.field}>
            <label htmlFor="login-email" className={styles.label}>
              이메일 주소<span className={styles.required}>*</span>
            </label>
            <input
              id="login-email"
              type="email"
              autoComplete="email"
              placeholder="example@gakjapgo.kr"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={styles.input}
            />
          </div>

          <div className={styles.field}>
            <label htmlFor="login-password" className={styles.label}>
              비밀번호<span className={styles.required}>*</span>
            </label>
            <input
              id="login-password"
              type="password"
              autoComplete="current-password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={styles.input}
            />
          </div>

          {error && (
            <p className={styles.error} role="alert">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={submitting}
            className={styles.submitBtn}
          >
            로그인
          </button>
        </form>

        <div className={styles.helpers}>
          <Link to="/password/find" className={styles.textLink}>
            비밀번호 찾기
          </Link>
          <p className={styles.signupRow}>
            처음이신가요?
            <Link to="/signup" className={styles.signupLink}>
              회원가입
            </Link>
          </p>
        </div>

        <SocialLoginButtons label="간편 로그인" />
      </div>
    </section>
  );
}

export default LoginPage;
