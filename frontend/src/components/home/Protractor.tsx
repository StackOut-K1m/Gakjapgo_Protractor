// src/components/home/Protractor.tsx
import {
  LAMP_MID,
  LAMP_ON,
  type TelltaleKey,
} from './trafficSignal';
import styles from './SignalHero.module.css';

/** 10° 간격 눈금 선. 반지름 340 호 위의 점에서 안쪽으로 40px 긋는다 */
const MAJOR_TICKS =
  'M600 80 600 40M547.9 84.6 541 45.2M497.4 98.1 483.7 60.5M450 120.2 430 85.6' +
  'M407.2 150.2 381.4 119.6M370.2 187.2 339.6 161.4M340.2 230 305.6 210' +
  'M318.1 277.4 280.5 263.7M304.6 327.9 265.2 321M300 380 260 380';

/** 눈금 숫자 위치. 0°가 오른쪽 위, 90°가 왼쪽 아래다 */
const TICK_LABELS: [number, number, string][] = [
  [600, 127, '0'],
  [554.5, 131, '10'],
  [510.4, 142.8, '20'],
  [469, 162.1, '30'],
  [431.6, 188.3, '40'],
  [399.3, 220.6, '50'],
  [373.1, 258, '60'],
  [353.8, 299.4, '70'],
  [342, 343.5, '80'],
  [338, 389, '90'],
];

interface ProtractorProps {
  /** 암·원점처럼 선으로 그리는 것에 쓸 색 */
  tint: string;
  /** 기어 글자에 쓸 색. 빨강은 선용이 너무 어두워 글자로 못 읽는다 */
  textTint: string;
  /** 측정 암이 가리킬 각도 */
  armDeg: number;
  /** 신호를 고르지 않았으면 암을 흐리게 둔다 */
  active: boolean;
  gear: string;
  status: string;
}

/**
 * 배경 각도기(0–90°).
 *
 * 이 서비스가 실제로 재는 것이 목 기울기 각도라, 배경에 그 도구를 깔았다.
 * 신호를 고르면 측정 암이 그 각도로 돌아간다 — 빨강 60°, 노랑 30°, 초록 0°.
 */
export default function Protractor({
  tint,
  textTint,
  armDeg,
  active,
  gear,
  status,
}: ProtractorProps) {
  return (
    <div className={styles['protractor']} data-active={active} aria-hidden>
      <svg width="760" height="470" viewBox="0 0 760 470" fill="none">
        {/* 판면과 두 기준변 */}
        <path d="M600 380V40A340 340 0 0 0 260 380Z" fill="rgba(255,255,255,.035)" />
        <path
          d="M600 40A340 340 0 0 0 260 380"
          stroke="rgba(255,255,255,.3)"
          strokeWidth="2.5"
        />
        <path
          d="M600 80A300 300 0 0 0 300 380"
          stroke="rgba(255,255,255,.16)"
          strokeWidth="1.5"
        />
        <path d="M600 380H240M600 380V26" stroke="rgba(255,255,255,.3)" strokeWidth="2.5" />

        {/* 2° 미세 눈금 — 굵은 점선 호로 대신한다. 선을 45개 긋는 것보다 가볍다 */}
        <path
          d="M600 60A320 320 0 0 0 280 380"
          stroke="rgba(255,255,255,.3)"
          strokeWidth="20"
          strokeDasharray="1.6 9.57"
        />

        <g stroke="rgba(255,255,255,.62)" strokeWidth="2.4">
          <path d={MAJOR_TICKS} />
        </g>

        <g
          fill="rgba(255,255,255,.7)"
          fontFamily="'JetBrains Mono',monospace"
          fontSize="24"
          textAnchor="middle"
        >
          {TICK_LABELS.map(([x, y, label]) => (
            <text key={label} x={x} y={y}>
              {label}
            </text>
          ))}
        </g>

        {/*
          판면 가운데에 '목 기울기 °' 라벨이 있었는데 뺐다 — 바로 아래 '어깨 기울기'
          경고등 라벨과 겹쳐서 둘 다 안 읽혔다. 눈금 숫자만으로도 각도판인 건 알아본다.
        */}

        {/* 측정 암. 각도가 바뀌면 원점을 축으로 돌아간다 */}
        <g
          className={styles['protractor-arm']}
          transform={`rotate(${-armDeg} 600 380)`}
          opacity={active ? 0.95 : 0.45}
        >
          <path d="M600 380V72" stroke={tint} strokeWidth="5" strokeLinecap="round" />
          <path d="M600 58 L610 82 L590 82 Z" fill={tint} />
        </g>

        {/* 원점 */}
        <circle cx="600" cy="380" r="9" fill={tint} />
        <path d="M568 380H632M600 380V404" stroke="rgba(255,255,255,.5)" strokeWidth="2" />

        <text
          x="430"
          y="440"
          fill={textTint}
          fontFamily="'Archivo Black',sans-serif"
          fontSize="26"
          textAnchor="middle"
          opacity=".9"
        >
          {gear}
        </text>
        <text
          x="430"
          y="464"
          fill="rgba(255,255,255,.4)"
          fontFamily="'JetBrains Mono',monospace"
          fontSize="13"
          letterSpacing="3"
          textAnchor="middle"
        >
          {status}
        </text>
      </svg>
    </div>
  );
}

/** 밝기에 따른 후광. 켜진 등만 두 겹으로 번지게 해서 세 단계를 구분한다 */
function glowOf(level: number, tint: string) {
  if (level >= LAMP_ON) {
    return `drop-shadow(0 0 9px ${tint}) drop-shadow(0 0 20px ${tint})`;
  }
  return level >= LAMP_MID ? `drop-shadow(0 0 6px ${tint})` : 'none';
}

/** 각도기 안쪽 경고등 위치와 그림. 자동차 계기판의 경고등을 빌려 왔다 */
const TELLTALES: {
  key: TelltaleKey;
  left: number;
  top: number;
  label: string;
  path: React.ReactNode;
}[] = [
  {
    key: 'neck',
    left: 470,
    top: 238,
    label: '거북목',
    path: (
      <>
        <path d="M9 3.5V20.5" strokeWidth="1.1" strokeDasharray="2 2.4" opacity=".55" />
        <circle cx="15.4" cy="6.2" r="3.1" fill="currentColor" stroke="none" />
        <path d="M13.6 9.2C11.2 10.9 9.6 12.7 9.3 15.4" />
        <path d="M6 16.4H13.4" />
        <path d="M9.3 15.4V20.6" />
      </>
    ),
  },
  {
    key: 'chin',
    left: 552,
    top: 290,
    label: '턱 괴기',
    path: (
      <>
        <circle cx="13.2" cy="6.6" r="3.1" fill="currentColor" stroke="none" />
        <path d="M11.4 9.6C9.9 11 9.2 12.6 9.2 14.4" />
        <path d="M11.6 10.4L8.2 13.2 5.6 19.4" />
        <path d="M3 20.4H21" strokeWidth="1.3" opacity=".55" />
      </>
    ),
  },
  {
    key: 'shoulder',
    left: 492,
    top: 344,
    label: '어깨 기울기',
    path: (
      <>
        <path d="M4.6 15.2L19.4 8.8" />
        <circle cx="4.6" cy="15.2" r="2.1" fill="currentColor" stroke="none" />
        <circle cx="19.4" cy="8.8" r="2.1" fill="currentColor" stroke="none" />
        <path d="M12 12L9.2 19.6H14.8Z" fill="currentColor" stroke="none" />
        <path d="M3 21.4H21" strokeWidth="1.1" opacity=".5" />
      </>
    ),
  },
];

interface TelltaleLayerProps {
  lamps: Record<TelltaleKey, number>;
  /** 신호 색. 대기 중에는 무채색이라 tint 와 따로 받는다 */
  warnColor: string;
  tint: string;
}

/** 각도기 안쪽에 뜨는 부위별 경고등 */
export function TelltaleLayer({ lamps, warnColor, tint }: TelltaleLayerProps) {
  return (
    <div className={styles['telltales']} aria-hidden>
      {TELLTALES.map((item) => (
        <div
          key={item.key}
          className={styles['telltale']}
          style={{
            left: item.left,
            top: item.top,
            color: warnColor,
            opacity: lamps[item.key],
            filter: glowOf(lamps[item.key], tint),
          }}
        >
          <svg
            width="34"
            height="34"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            {item.path}
          </svg>
          <span className={styles['telltale-label']}>{item.label}</span>
        </div>
      ))}
    </div>
  );
}
