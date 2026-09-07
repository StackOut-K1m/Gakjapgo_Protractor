import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link } from 'react-router-dom';

import { findPassword } from '@/api/authApi';
import { getApiErrorMessage } from '@/api/client';
import logoImg from '@/assets/logo.png';
import styles from './LoginPage.module.css';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function PasswordFindPage() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [sentMsg, setSentMsg] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError('');
    setSentMsg('');

    if (!EMAIL_PATTERN.test(email.trim())) {
      setError('올바른 이메일 형식이 아닙니다.');
      return;
    }

    setSubmitting(true);
    try {
      const { message } = await findPassword(email.trim());
      setSentMsg(message);
    } catch (err) {
      setError(getApiErrorMessage(err, '임시 비밀번호 발송에 실패했습니다.'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className={styles.page}>
      <div className={styles.card}>
        <div className={styles.brand}>
          <img src={logoImg} alt="" className={styles.logoImg} />
          <h1 className={styles.wordmark}>비밀번호 찾기</h1>
          <p className={styles.tagline}>
            가입한 이메일로 임시 비밀번호를 보내드립니다.
          </p>
        </div>

        <form className={styles.form} onSubmit={handleSubmit} noValidate>
          <div className={styles.field}>
            <label htmlFor="find-email" className={styles.label}>
              이메일 주소<span className={styles.required}>*</span>
            </label>
            <input
              id="find-email"
              type="email"
              autoComplete="email"
              placeholder="example@gakjapgo.kr"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={styles.input}
            />
          </div>

          {error && (
            <p className={styles.error} role="alert">
              {error}
            </p>
          )}
          {sentMsg && <p className={styles.sent}>{sentMsg}</p>}

          <button
            type="submit"
            disabled={submitting}
            className={styles.submitBtn}
          >
            {submitting ? '발송 중…' : '임시 비밀번호 발송'}
          </button>
        </form>

        <div className={styles.helpers}>
          <Link to="/login" className={styles.textLink}>
            로그인 페이지로 돌아가기
          </Link>
        </div>
      </div>
    </section>
  );
}

export default PasswordFindPage;
