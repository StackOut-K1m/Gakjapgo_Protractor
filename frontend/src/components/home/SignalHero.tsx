// src/components/home/SignalHero.tsx
import { useState } from 'react';
import { Link } from 'react-router-dom';

import Protractor, { TelltaleLayer } from './Protractor';
import {
  IDLE,
  SIGNALS,
  SIGNAL_TINT,
  SIGNAL_TINT_TEXT,
  TELLTALES,
  TELLTALES_IDLE,
  type Signal,
} from './trafficSignal';
import styles from './SignalHero.module.css';

const ORDER: Signal[] = ['red', 'yellow', 'green'];

interface SignalHeroProps {
  /** 지금 공부 중인 인원. 0 이면 문구를 감춘다 — '0명 공부 중'은 안 보여주느니만 못하다 */
  onlineCount: number;
  /** '작동 원리' 버튼이 데려갈 곳(아래 캘리브레이션 설명 섹션의 id) */
  howToId: string;
}

/**
 * 비로그인 홈의 첫 화면 — 신호등과 배경 각도기.
 *
 * <p>등에 마우스를 올리면 세 가지가 함께 움직인다: 배경 각도기의 측정 암이 그 신호의 목
 * 기울기로 돌아가고, 각도기 안쪽 부위별 경고등이 켜지고, 왼쪽에 설명 카드가 뜬다.
 * 세 가지가 같은 상태를 각각 각도·부위·문장으로 말한다.
 */
export default function SignalHero({ onlineCount, howToId }: SignalHeroProps) {
  const [active, setActive] = useState<Signal | null>(null);

  const info = active ? SIGNALS[active] : null;
  const tint = active ? SIGNAL_TINT[active] : IDLE.tint;
  const textTint = active ? SIGNAL_TINT_TEXT[active] : IDLE.tint;
  const lamps = active ? TELLTALES[active] : TELLTALES_IDLE;
  // 대기 중에는 경고등을 색 없이 흐린 흰색으로 둔다 — 무엇도 감지되지 않은 상태다
  const warnColor = active ? tint : 'rgba(255,255,255,.55)';

  return (
    <section className={styles['hero']}>
      <Protractor
        tint={tint}
        textTint={textTint}
        armDeg={info ? info.armDeg : IDLE.armDeg}
        active={Boolean(info)}
        gear={info ? info.gear : IDLE.gear}
        status={info ? info.status : IDLE.status}
      />
      <TelltaleLayer lamps={lamps} warnColor={warnColor} tint={tint} />

      <div className={styles['copy']}>
        <h1 className={styles['title']}>
          각을 잡으면
          <br />
          초록불이 켜집니다
        </h1>
        <p className={styles['lead']}>
          웹캠이 목·어깨의 각도를 읽고 세 가지 신호로 알려줍니다. 자세가
          무너지면 <strong data-signal="red">빨간불</strong>이 켜지고, 반복되면{' '}
          <strong data-signal="yellow">노란불</strong>에서 스트레칭하고, 바르게
          앉으면 <strong data-signal="green">초록불</strong>로 학습을
          이어갑니다.
        </p>

        <div className={styles['cta-row']}>
          {/* 로그인으로 보낸다. 아직 계정이 없으면 그 화면에서 회원가입으로 넘어갈 수 있고,
              이미 계정이 있는 사람을 가입 화면으로 보내면 한 번 되돌아 나와야 한다 */}
          <Link to="/login" className={styles['cta-primary']}>
            신호등 켜기
          </Link>
          <a href={`#${howToId}`} className={styles['cta-ghost']}>
            작동 원리
          </a>
        </div>

        <div className={styles['metrics']}>
          <div className={styles['metric']}>
            <span className={styles['metric-value']}>30s</span>
            <span className={styles['metric-label']}>자세 판정 주기</span>
          </div>
          {/* 접속자 수는 실제 값이다. 0 이면 아예 감춘다 */}
          {onlineCount > 0 && (
            <div className={styles['metric']}>
              <span className={styles['metric-value']}>{onlineCount}</span>
              <span className={styles['metric-label']}>지금 공부 중</span>
            </div>
          )}
        </div>
      </div>

      {/* 설명 카드가 위, 신호등이 아래. 둘을 묶어 오른쪽 끝에 붙인다 */}
      <div className={styles['signal-row']}>
        {/*
          고르기 전에는 아무것도 그리지 않는다. 안내 문구를 점선 상자로 띄워 두었더니
          빈 자리를 메우려고 넣은 티만 났다. 자리는 CSS 가 비워 둔 채로 지킨다.
        */}
        <div className={styles['detail']}>
          {info && (
            <article className={styles['detail-card']} data-signal={active}>
              <span className={styles['detail-stripe']} />
              <div className={styles['detail-body']}>
                <span className={styles['detail-code']}>{info.code}</span>
                <h2 className={styles['detail-title']}>{info.title}</h2>
                <p className={styles['detail-desc']}>{info.desc}</p>
              </div>
            </article>
          )}
        </div>

        {/* 가로로 누운 신호등. 등은 왼쪽부터 빨강·노랑·초록 */}
        <div className={styles['lamp-column']}>
          <div className={styles['lamp-box']}>
            {ORDER.map((signal) => (
              <button
                key={signal}
                type="button"
                className={styles['lamp']}
                data-signal={signal}
                data-on={active === signal}
                aria-pressed={active === signal}
                aria-label={SIGNALS[signal].title}
                onMouseEnter={() => setActive(signal)}
                onMouseLeave={() => setActive(null)}
                onFocus={() => setActive(signal)}
                onBlur={() => setActive(null)}
                onClick={() => setActive(signal)}
              />
            ))}
          </div>
          <span className={styles['lamp-pole']} />
          <span className={styles['lamp-base']} />
        </div>
      </div>
    </section>
  );
}
