// 감지 경고 배너 — 스터디룸 상단에 떠서 사용자에게 알린다.
// 휴대폰 사용·자리비움 등 즉시 알려야 하는 상황에 사용.
import styles from './DetectionAlert.module.css';

export type AlertKind = 'PHONE' | 'AWAY' | 'POSTURE' | 'DROWSY';

const CONTENT: Record<AlertKind, { icon: string; title: string; desc: string }> = {
  PHONE: {
    icon: '📱',
    title: '휴대폰이 감지되었습니다',
    desc: '집중을 위해 휴대폰을 시야 밖에 두세요.',
  },
  AWAY: {
    icon: '🚶',
    title: '자리를 비우셨나요?',
    desc: '사용자가 인식되지 않아 학습 시간이 일시정지됩니다.',
  },
  POSTURE: {
    icon: '🪑',
    title: '자세가 흐트러졌습니다',
    desc: '허리를 펴고 화면과 거리를 유지해주세요.',
  },
  DROWSY: {
    icon: '😴',
    title: '졸음이 감지되었습니다',
    desc: '잠시 스트레칭하거나 휴식을 취해보세요.',
  },
};

interface Props {
  kind: AlertKind;
  /** 디버그용 부가 정보 (신뢰도 등) */
  detail?: string;
}

export default function DetectionAlert({ kind, detail }: Props) {
  const { icon, title, desc } = CONTENT[kind];
  return (
    <div className={styles.alert} role="status" aria-live="polite">
      <span className={styles.icon} aria-hidden>
        {icon}
      </span>
      <div className={styles.text}>
        <strong className={styles.title}>{title}</strong>
        <span className={styles.desc}>{desc}</span>
      </div>
      {detail && <span className={styles.detail}>{detail}</span>}
    </div>
  );
}
