// src/components/home/HowItWorksSection.tsx
import { SIGNALS, type Signal } from './trafficSignal';
import styles from './HowItWorksSection.module.css';

const ORDER: Signal[] = ['red', 'yellow', 'green'];

/** 캘리브레이션 단계. 실제 준비 화면(RoomPreparationPage)이 하는 일과 같은 순서다 */
const STEPS = [
  {
    n: '01',
    title: '카메라 켜고 바르게 앉기',
    desc: '귀·어깨가 한 선에 오도록 앉습니다. 고개가 옆으로 기울면 다음으로 넘어가지 않아요.',
  },
  {
    n: '02',
    title: '5초 동안 기준 자세 저장',
    desc: '그 5초 사이에 자세가 무너지면 처음부터 다시 잽니다. 기준선이 틀어진 채 저장되면 이후 판정이 전부 어긋나요.',
  },
  {
    n: '03',
    title: '내 몸에 맞춘 기준으로 판정',
    desc: '사람마다 목·어깨 비율이 달라 절대 각도로는 못 잽니다. 방금 저장한 내 자세가 기준선이 됩니다.',
  },
];

interface HowItWorksSectionProps {
  /** 히어로의 '작동 원리' 버튼이 찾아올 앵커 */
  id: string;
}

/** 세 신호가 무엇인지, 기준선은 어떻게 잡는지. 비로그인 홈에서 서비스를 설명하는 자리다 */
export default function HowItWorksSection({ id }: HowItWorksSectionProps) {
  return (
    <section className={styles['section']} id={id}>
      <header className={styles['head']}>
        <span className={styles['kicker']}>HOW IT WORKS</span>
        <h2 className={styles['title']}>세 가지 신호로만 말합니다</h2>
        <p className={styles['desc']}>
          잔소리 대신 신호등 하나. 지금 어떤 상태인지 색으로만 알려주고, 필요할
          때만 끼어듭니다.
        </p>
      </header>

      <div className={styles['cards']}>
        {ORDER.map((signal) => {
          const info = SIGNALS[signal];
          return (
            <article
              key={signal}
              className={styles['card']}
              data-signal={signal}
            >
              <span className={styles['card-dot']} />
              <span className={styles['card-code']}>{info.code}</span>
              <h3 className={styles['card-title']}>{info.title}</h3>
              <p className={styles['card-desc']}>{info.desc}</p>
            </article>
          );
        })}
      </div>

      <div className={styles['calib']}>
        <div className={styles['calib-head']}>
          <span className={styles['kicker']}>CALIBRATION</span>
          <h3 className={styles['calib-title']}>
            판정 기준은 남이 아니라 내 자세입니다
          </h3>
          <p className={styles['desc']}>
            방에 들어가기 전 5초, 바른 자세를 한 번 저장합니다. 그 뒤로는 그
            기준에서 얼마나 벗어났는지만 봅니다.
          </p>
        </div>

        <ol className={styles['steps']}>
          {STEPS.map((step) => (
            <li key={step.n} className={styles['step']}>
              <span className={styles['step-n']}>{step.n}</span>
              <span className={styles['step-text']}>
                <span className={styles['step-title']}>{step.title}</span>
                <span className={styles['step-desc']}>{step.desc}</span>
              </span>
            </li>
          ))}
        </ol>

        <p className={styles['calib-note']}>
          🔒 졸음·자세 판정에 쓰는 영상은 브라우저 안에서만 처리됩니다. 서버로
          올라가는 것은 각도와 시간 같은 수치뿐이에요.
        </p>
      </div>
    </section>
  );
}
