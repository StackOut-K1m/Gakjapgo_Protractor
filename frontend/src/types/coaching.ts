// src/types/coaching.ts

/** 감지 카테고리. 화면 구조는 같고 표시할 항목만 달라진다. */
export type CoachingMode =
  'posture' | 'camera-off' | 'environment' | 'camera-quality' | 'landmark';

/** ok = 정상, warning = 경고, paused = 감지 불가(카메라 꺼짐 등) */
export type CheckState = 'ok' | 'warning' | 'paused';

export interface CoachingCheck {
  id: string;
  okLabel: string;
  warningLabel: string;
  pausedLabel: string;
  /** 경고 시 비디오 위에 띄울 문구 */
  toast: string;
}

export interface CoachingModeConfig {
  /** 상태 바 앞에 붙는 라벨 */
  barLabel: string;
  /** 하단 좌측 상태 칩 */
  chipLabel: string;
  /** 비디오 아래 안내 문구 */
  caption: string;
  checks: CoachingCheck[];
}

export const COACHING_MODES: Record<CoachingMode, CoachingModeConfig> = {
  posture: {
    barLabel: '실시간 자세 분석 상태:',
    chipLabel: '자세 진단 중',
    // 이 문구는 대비책이다. 실제 화면에서는 StudyRoomPage 가 지금 떠 있는 경고에 맞춰
    // 만든 문구(recoveryHint)로 덮는다 — 해제 조건이 자세(2초)와 턱 괴기(1초)로 달라서
    // 여기 고정 문구로는 둘 중 하나가 늘 틀린 말이 된다.
    caption:
      '바른 자세를 2초간 유지하면 자동으로 이전 스터디룸 화면으로 돌아갑니다.',
    checks: [
      {
        id: 'neck',
        okLabel: '목 정상',
        warningLabel: '거북목 감지!',
        pausedLabel: '거북목 –',
        toast: '거북목 감지 - 목을 곧게 세워주세요!',
      },
      {
        id: 'drowsy',
        okLabel: '졸음 정상',
        warningLabel: '졸음 감지!',
        pausedLabel: '졸음 –',
        toast: '졸음 감지 - 잠시 스트레칭해 주세요!',
      },
      {
        id: 'shoulder',
        okLabel: '어깨 균형',
        warningLabel: '어깨 기울어짐!',
        pausedLabel: '어깨 –',
        toast: '어깨가 기울었습니다 - 양쪽 높이를 맞춰주세요!',
      },
      {
        id: 'back',
        okLabel: '턱 안 굄',
        warningLabel: '턱 괴기 감지!',
        pausedLabel: '턱 –',
        toast: '턱을 괴고 있습니다 - 손을 내리고 앉아주세요!',
      },
    ],
  },

  'camera-off': {
    barLabel: '실시간 자세 분석 상태: 일시중지 (카메라 꺼짐)',
    chipLabel: '카메라 꺼짐',
    caption: '카메라를 켜면 자세 분석과 학습 시간 기록이 자동으로 재개됩니다.',
    checks: [
      {
        id: 'neck',
        okLabel: '목 정상',
        warningLabel: '거북목 –',
        pausedLabel: '거북목 –',
        toast: '카메라가 꺼져 있어요 - 카메라를 켜주세요!',
      },
      {
        id: 'drowsy',
        okLabel: '졸음 정상',
        warningLabel: '졸음 –',
        pausedLabel: '졸음 –',
        toast: '카메라가 꺼져 있어요 - 카메라를 켜주세요!',
      },
      {
        id: 'shoulder',
        okLabel: '어깨 균형',
        warningLabel: '어깨 –',
        pausedLabel: '어깨 –',
        toast: '카메라가 꺼져 있어요 - 카메라를 켜주세요!',
      },
      {
        id: 'back',
        okLabel: '턱 안 굄',
        warningLabel: '턱 –',
        pausedLabel: '턱 –',
        toast: '카메라가 꺼져 있어요 - 카메라를 켜주세요!',
      },
    ],
  },

  environment: {
    barLabel: '실시간 환경 감지 상태:',
    chipLabel: '조명 감지 중',
    caption: '현재 공부 공간이 너무 어둡습니다. 주변 조명을 밝게 조절해주세요.',
    checks: [
      {
        id: 'lighting',
        okLabel: '조명 정상',
        warningLabel: '조명 어두움!',
        pausedLabel: '조명 –',
        toast: '조명 이상 감지 - 주변 조명을 조절해주세요!',
      },
      {
        id: 'brightness',
        okLabel: '밝기 정상',
        warningLabel: '밝기 이상!',
        pausedLabel: '밝기 –',
        toast: '밝기 이상 감지 - 화면 밝기를 조절해주세요!',
      },
      {
        id: 'contrast',
        okLabel: '대비 정상',
        warningLabel: '대비 낮음!',
        pausedLabel: '대비 –',
        toast: '대비가 낮습니다 - 배경과 구분되도록 조절해주세요!',
      },
      {
        id: 'colorTemp',
        okLabel: '색온도 정상',
        warningLabel: '색온도 이상!',
        pausedLabel: '색온도 –',
        toast: '색온도 이상 감지 - 조명 색을 조절해주세요!',
      },
    ],
  },

  'camera-quality': {
    barLabel: '실시간 카메라 상태:',
    chipLabel: '렌즈 점검 중',
    caption:
      '사용자의 모습이 흐릿하게 보입니다. 렌즈 상태를 확인 후 닦아주세요.',
    checks: [
      {
        id: 'lens',
        okLabel: '렌즈 정상',
        warningLabel: '렌즈 흐림!',
        pausedLabel: '렌즈 –',
        toast: '렌즈 이상 감지 - 카메라 렌즈를 확인해주세요!',
      },
      {
        id: 'resolution',
        okLabel: '해상도 정상',
        warningLabel: '해상도 낮음!',
        pausedLabel: '해상도 –',
        toast: '해상도가 낮습니다 - 카메라 설정을 확인해주세요!',
      },
      {
        id: 'focus',
        okLabel: '초점 정상',
        warningLabel: '초점 흐림!',
        pausedLabel: '초점 –',
        toast: '초점이 맞지 않습니다 - 카메라 위치를 조절해주세요!',
      },
      {
        id: 'frame',
        okLabel: '프레임 정상',
        warningLabel: '프레임 끊김!',
        pausedLabel: '프레임 –',
        toast: '프레임이 끊깁니다 - 네트워크와 카메라를 확인해주세요!',
      },
    ],
  },

  landmark: {
    barLabel: '실시간 랜드마크 감지 상태:',
    chipLabel: '랜드마크 감지 중',
    caption:
      '현재 사용자의 눈이 확인되지 않습니다. 화면에 눈이 보일 수 있도록 조정해주세요.',
    checks: [
      {
        id: 'eye',
        okLabel: '눈 정상',
        warningLabel: '눈 미감지!',
        pausedLabel: '눈 –',
        toast: '눈 랜드마크 미감지 - 화면을 확인해주세요!',
      },
      {
        id: 'nose',
        okLabel: '코 정상',
        warningLabel: '코 미감지!',
        pausedLabel: '코 –',
        toast: '코 랜드마크 미감지 - 화면을 확인해주세요!',
      },
      {
        id: 'mouth',
        okLabel: '입 정상',
        warningLabel: '입 미감지!',
        pausedLabel: '입 –',
        toast: '입 랜드마크 미감지 - 화면을 확인해주세요!',
      },
      {
        id: 'ear',
        okLabel: '귀 정상',
        warningLabel: '귀 미감지!',
        pausedLabel: '귀 –',
        toast: '귀 랜드마크 미감지 - 화면을 확인해주세요!',
      },
    ],
  },
};

/**
 * 서버 자세 3종을 posture 모드의 체크 항목에 대응시킨다.
 *
 * 'drowsy' 는 서버에 대응하는 판정이 없어서 비어 있다. 졸음 감지가 붙기 전까지는
 * 항상 정상으로 표시된다.
 */
/**
 * 서버 자세 판정 → 코칭 항목.
 *
 * 'back' 자리는 브라우저가 판정하는 턱 괴기가 쓴다 — StudyRoomPage 의 warningCheckIds 참고.
 */
export const POSTURE_TYPE_TO_CHECK: Record<string, string> = {
  FORWARD_HEAD: 'neck',
  SHOULDER_TILT: 'shoulder',
};

/** 감지 엔진이 만들어내는 결과. 이 형태만 맞추면 UI는 그대로 동작한다. */
export interface CoachingState {
  mode: CoachingMode;
  /** 항목 id -> 상태 */
  checks: Record<string, CheckState>;
  /** 경고 중인 항목 id 목록 (표시 우선순위 순) */
  warningIds: string[];
  /** 이 상황이 지속된 시간(초) */
  elapsedSeconds: number;
}

export const NO_WARNING: CoachingState = {
  mode: 'posture',
  checks: { neck: 'ok', drowsy: 'ok', shoulder: 'ok', back: 'ok' },
  warningIds: [],
  elapsedSeconds: 0,
};
