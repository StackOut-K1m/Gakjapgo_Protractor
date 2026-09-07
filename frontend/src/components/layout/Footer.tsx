// src/components/layout/Footer.tsx
import { Link } from 'react-router-dom';

import styles from './Footer.module.css';

export default function Footer() {
  return (
    <footer className={styles['site-footer']}>
      <div className={styles['footer-inner']}>
        <div className={styles['footer-brand-block']}>
          <p className={styles['footer-brand']}>각잡고</p>
          <p className={styles['footer-desc']}>
            실시간 자세 교정과 집중도 체크 스터디 웹서비스
          </p>
          <p className={styles['footer-copy']}>
            ⓒ 2026 Team 각잡고. All Rights Reserved.
          </p>
        </div>

        {/* 이용약관·개인정보처리방침 링크는 뗐다. 내용이 아직 비어 있어 눌러 봐야
            빈 화면만 나온다. 라우트(/support/*)는 남겨 뒀으니 문서가 준비되면
            여기에 다시 붙이면 된다. */}
        <nav className={styles['footer-links']}>
          <Link to="/support" className={styles['footer-link']}>
            문의
          </Link>
        </nav>
      </div>
    </footer>
  );
}
