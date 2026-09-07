// src/components/home/trafficSignal.ts
//
// 홈 히어로의 신호등 데이터.
//
// 화면 요소와 무관한 값만 모아 둔다 — 컴포넌트 안에 두면 렌더할 때마다 다시 만들어지고,
// 신호 설명 카드와 아래 '작동 원리' 섹션이 같은 문구를 두 벌 갖게 된다.
import { POSTURE_WINDOW_SECONDS } from '@/hooks/usePostureFrames';

/** 신호등 세 칸 */
export type Signal = 'red' | 'yellow' | 'green';

export interface SignalInfo {
  code: string;
  title: string;
  desc: string;
  /** 배경 각도기의 측정 암이 가리킬 목 기울기(도) */
  armDeg: number;
  /** 각도기 아래 기어 표시. 자동차 계기판을 빌려 온 표기다 */
  gear: string;
  /** 기어 옆 한 줄 상태 */
  status: string;
}

export const SIGNALS: Record<Signal, SignalInfo> = {
  red: {
    code: 'SIGNAL 01 / STOP',
    title: '거북목·어깨 불균형 등 감지',
    // 판정 시간은 상수에서 끌어 쓴다. 숫자를 여기 박아 두면 기준을 바꿀 때마다
    // 비로그인 첫 화면이 거짓말을 하게 된다
    desc: `목이 앞으로 기울거나 어깨 높낮이가 안맞는 상태입니다. 이 자세가 ${POSTURE_WINDOW_SECONDS}초 넘게 이어지면 경고로 확정하고, 세 번 쌓이면 스트레칭 화면으로 넘어갑니다.`,
    armDeg: 60,
    gear: 'S',
    status: 'STOP · 자세 복구까지 타이머 정지',
  },
  yellow: {
    code: 'SIGNAL 02 / WAIT',
    title: '피로 누적, 스트레칭 시간',
    desc: '같은 자세가 반복해서 무너지고 있습니다. 몸이 버티는 힘이 떨어졌다는 신호라, 굳은 곳을 풀고 다시 앉는 편이 빠릅니다.',
    armDeg: 30,
    gear: 'W',
    status: 'WAIT · 스트레칭 60초',
  },
  green: {
    code: 'SIGNAL 03 / GO',
    title: '바른 자세로 학습 중',
    desc: '캘리브레이션 때 잡아 둔 기준선 안에 있습니다. 방해하지 않고 조용히 기록만 합니다.',
    armDeg: 0,
    gear: 'D',
    status: 'DRIVE · 집중 시간 적립 중',
  },
};

/** 아무 신호도 고르지 않았을 때(대기) */
export const IDLE = {
  tint: '#6f7a86',
  armDeg: 0,
  gear: 'P',
  status: 'PARK · 신호 대기',
};

/** 각도기 암·원점처럼 '선'으로 그리는 것. 신호 3색 그대로다 */
export const SIGNAL_TINT: Record<Signal, string> = {
  red: '#f04652',
  yellow: '#ffca3a',
  green: '#8ac926',
};

/**
 * 같은 자리의 '글자'(기어 표시)에 쓰는 색.
 *
 * 한때 빨강만 따로였다 — 선으로는 보여도 글자로는 안 읽혀서. 지금은 빨강을 한 색으로
 * 통일해 셋 다 같은 값이다. 기어 글자는 26px 이라 3.4:1 로도 형태는 잡힌다.
 * 다시 갈라야 할 때를 대비해 자리는 남겨 둔다.
 */
export const SIGNAL_TINT_TEXT: Record<Signal, string> = { ...SIGNAL_TINT };

/** 경고등 밝기 3단계 */
export const LAMP_ON = 1;
export const LAMP_MID = 0.68;
export const LAMP_OFF = 0.34;

/** 감지 부위 — 각도기 안쪽에 뜨는 경고등 */
export type TelltaleKey = 'neck' | 'chin' | 'shoulder';

/**
 * 신호별로 어느 경고등이 얼마나 밝은지.
 *
 * 실제 판정과 맞춘 조합이다 — 빨간불은 거북목·턱 괴기가 확정된 상태, 노란불은 어깨가 먼저
 * 무너지며 목이 따라가는 상태, 초록불은 셋 다 조용하다.
 */
export const TELLTALES: Record<Signal, Record<TelltaleKey, number>> = {
  red: { neck: LAMP_ON, chin: LAMP_ON, shoulder: LAMP_MID },
  yellow: { neck: LAMP_MID, chin: LAMP_OFF, shoulder: LAMP_ON },
  green: { neck: LAMP_OFF, chin: LAMP_OFF, shoulder: LAMP_OFF },
};

export const TELLTALES_IDLE: Record<TelltaleKey, number> = {
  neck: LAMP_OFF,
  chin: LAMP_OFF,
  shoulder: LAMP_OFF,
};
