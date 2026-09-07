import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';

import { login, sendEmailCode, signup, verifyEmailCode } from '@/api/authApi';
import { getApiErrorMessage } from '@/api/client';
import SocialLoginButtons from '@/components/auth/SocialLoginButtons';
import { useAuthStore } from '@/stores/useAuthStore';
import logoImg from '@/assets/logo.png';
import styles from './SignupPage.module.css';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// 백엔드 SignupRequest 의 검증 규칙과 동일하게 맞춘다.
const NICKNAME_PATTERN = /^[가-힣A-Za-z0-9]{2,16}$/;
const PASSWORD_PATTERN = /^(?=.*[A-Za-z])(?=.*\d).{8,64}$/;

function SignupPage() {
  const navigate = useNavigate();
  const setAuth = useAuthStore((state) => state.setAuth);
  const member = useAuthStore((state) => state.member);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // ── 이메일 인증. 백엔드가 인증 완료된 이메일만 가입을 받아준다(미인증이면 403) ──
  const [code, setCode] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  const [emailVerified, setEmailVerified] = useState(false);
  const [sendingCode, setSendingCode] = useState(false);
  const [verifyingCode, setVerifyingCode] = useState(false);
  const [notice, setNotice] = useState('');
  /**
   * 방금 이 화면에서 가입을 마쳤는지.
   *
   * setAuth 로 member 가 채워지면 아래 로그인 가드가 렌더 단계에서 홈으로 리다이렉트해버려,
   * 이어지는 navigate('/onboarding') 이 밀린다. 가입 직후에는 가드를 건너뛴다.
   */
  const [justSignedUp, setJustSignedUp] = useState(false);

  // 이미 로그인된 상태면 회원가입 화면을 보여줄 필요가 없다
  if (member && !justSignedUp) {
    return <Navigate to="/" replace />;
  }

  async function handleSendCode() {
    setError('');
    setNotice('');
    if (!EMAIL_PATTERN.test(email.trim())) {
      setError('올바른 이메일 형식이 아닙니다.');
      return;
    }
    setSendingCode(true);
    try {
      await sendEmailCode(email.trim());
      setCodeSent(true);
      setNotice('인증 코드를 보냈어요. 메일함(스팸함 포함)을 확인해 주세요.');
    } catch (err) {
      setError(getApiErrorMessage(err, '인증 코드 발송에 실패했습니다.'));
    } finally {
      setSendingCode(false);
    }
  }

  async function handleVerifyCode() {
    setError('');
    setNotice('');
    if (!/^\d{6}$/.test(code.trim())) {
      setError('인증 코드는 6자리 숫자입니다.');
      return;
    }
    setVerifyingCode(true);
    try {
      await verifyEmailCode(email.trim(), code.trim());
      setEmailVerified(true);
      setNotice('이메일 인증이 완료되었습니다.');
    } catch (err) {
      setError(getApiErrorMessage(err, '인증 코드 확인에 실패했습니다.'));
    } finally {
      setVerifyingCode(false);
    }
  }

  function handleEmailChange(value: string) {
    setEmail(value);
    // 인증 후 이메일을 바꾸면 그 인증은 다른 주소의 것이다. 처음부터 다시 받게 한다.
    if (codeSent || emailVerified) {
      setCodeSent(false);
      setEmailVerified(false);
      setCode('');
      setNotice('');
    }
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError('');

    if (!NICKNAME_PATTERN.test(name.trim())) {
      setError('이름은 한글·영문·숫자만 사용해 2자 이상 16자 이하로 입력해 주세요.');
      return;
    }
    if (!EMAIL_PATTERN.test(email.trim())) {
      setError('올바른 이메일 형식이 아닙니다.');
      return;
    }
    if (!PASSWORD_PATTERN.test(password)) {
      setError('비밀번호는 영문과 숫자를 포함해 8자 이상이어야 합니다.');
      return;
    }
    if (password !== passwordConfirm) {
      setError('비밀번호가 일치하지 않습니다.');
      return;
    }
    if (!emailVerified) {
      setError('이메일 인증을 먼저 완료해 주세요.');
      return;
    }

    setSubmitting(true);
    try {
      await signup({
        email: email.trim(),
        password,
        passwordConfirm,
        nickname: name.trim(),
      });
      // 가입 응답에는 토큰이 없으므로, 바로 로그인까지 이어서 처리한다.
      const result = await login({ email: email.trim(), password });
      // 로그인 가드가 홈으로 튕기지 않도록 setAuth 보다 먼저 표시해둔다.
      setJustSignedUp(true);
      setAuth(result);
      // 가입 직후에는 홈이 아니라 온보딩으로 보낸다. 온보딩에서 건너뛰면 홈으로 간다.
      navigate('/onboarding', { replace: true });
    } catch (err) {
      setError(getApiErrorMessage(err, '회원가입에 실패했습니다.'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className={styles.page}>
      <div className={styles.card}>
        <div className={styles.brand}>
          <img src={logoImg} alt="" className={styles.logoImg} />
          <h1 className={styles.wordmark}>회원가입</h1>
          <p className={styles.tagline}>
            성장하는 스터디원들과의 연결, 각잡고에서 시작하세요.
          </p>
        </div>

        <form className={styles.form} onSubmit={handleSubmit} noValidate>
          <div className={styles.field}>
            <label htmlFor="signup-name" className={styles.label}>
              이름<span className={styles.required}>*</span>
            </label>
            <input
              id="signup-name"
              type="text"
              autoComplete="name"
              placeholder="이름을 입력해 주세요"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={styles.input}
            />
          </div>

          <div className={styles.field}>
            <label htmlFor="signup-email" className={styles.label}>
              이메일 주소<span className={styles.required}>*</span>
            </label>
            <div className={styles.fieldRow}>
              <input
                id="signup-email"
                type="email"
                autoComplete="email"
                placeholder="인증 가능한 이메일 주소"
                value={email}
                onChange={(e) => handleEmailChange(e.target.value)}
                disabled={emailVerified}
                className={styles.input}
              />
              <button
                type="button"
                onClick={handleSendCode}
                disabled={sendingCode || emailVerified}
                className={styles.inlineBtn}
              >
                {emailVerified ? '인증 완료' : codeSent ? '재발송' : '인증코드 발송'}
              </button>
            </div>
          </div>

          {codeSent && !emailVerified && (
            <div className={styles.field}>
              <label htmlFor="signup-code" className={styles.label}>
                인증 코드<span className={styles.required}>*</span>
              </label>
              <div className={styles.fieldRow}>
                <input
                  id="signup-code"
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  placeholder="메일로 받은 6자리 숫자"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  className={styles.input}
                />
                <button
                  type="button"
                  onClick={handleVerifyCode}
                  disabled={verifyingCode}
                  className={styles.inlineBtn}
                >
                  확인
                </button>
              </div>
            </div>
          )}

          <div className={styles.field}>
            <label htmlFor="signup-password" className={styles.label}>
              비밀번호<span className={styles.required}>*</span>
            </label>
            <input
              id="signup-password"
              type="password"
              autoComplete="new-password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={styles.input}
            />
          </div>

          <div className={styles.field}>
            <label htmlFor="signup-password-confirm" className={styles.label}>
              비밀번호 확인<span className={styles.required}>*</span>
            </label>
            <input
              id="signup-password-confirm"
              type="password"
              autoComplete="new-password"
              placeholder="••••••••"
              value={passwordConfirm}
              onChange={(e) => setPasswordConfirm(e.target.value)}
              className={styles.input}
            />
          </div>

          {notice && !error && <p className={styles.notice}>{notice}</p>}
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
            가입하기
          </button>
        </form>

        <div className={styles.helpers}>
          <p className={styles.loginRow}>
            이미 계정이 있으신가요?
            <Link to="/login" className={styles.loginLink}>
              로그인 페이지로
            </Link>
          </p>
        </div>

        {/* 소셜은 가입과 로그인의 입구가 같다. 처음 온 사람이면 백엔드가 계정을 만들어 주고,
            그 뒤 온보딩까지는 OAuthCallbackPage 가 이어받는다. */}
        <SocialLoginButtons label="간편 회원가입" />
      </div>
    </section>
  );
}

export default SignupPage;
