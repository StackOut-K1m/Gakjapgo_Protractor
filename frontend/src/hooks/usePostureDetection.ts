// src/hooks/usePostureDetection.ts
import { useCallback, useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import type { NormalizedLandmark } from '@mediapipe/tasks-vision';

import { previewPostureFrame } from '@/api/postureApi';
import { usePoseStream } from '@/hooks/usePoseStream';
import { computeMetrics } from '@/lib/pose/landmarks';
import { extractPostureFeatures } from '@/lib/pose/postureFeatures';
import {
  ALERT_SEVERITY,
  POSTURE_TYPES,
  type DetectionStatus,
  type PostureFeatures,
  type PostureType,
} from '@/types/posture';

/**
 * 약 1초(30fps 기준) 연속 통과해야 인정.
 *
 * 한 프레임이라도 어긋나면 0 부터 다시 세므로 체감 대기는 이 값보다 길다. 45(1.5초)로 두니
 * 안내선 안에 들어와도 버튼이 한참 안 켜져서 30 으로 줄였다. 더 줄이면 잠깐 스쳐 지나간
 * 자세가 기준으로 등록될 수 있다 — 이 값이 이후 모든 자세 판정의 기준선이 된다.
 */
const VERIFY_FRAMES = 30;

/** 상반신 랜드마크 최소 신뢰도 — 어깨가 가려지면 판정하지 않는다 */
const MIN_VISIBILITY = 0.5;

/**
 * 입장 준비용 기하 검사.
 *
 * "촬영 가능한 자세"만 본다 — 고개를 푹 숙이면 얼굴 랜드마크가 불안정하고, 몸이 크게 기울면
 * 기준선 자체가 쓸 수 없는 값이 된다. 자세가 좋은지는 아래 서버 모델 판정이 본다.
 */
const MAX_HEAD_PITCH = 0.45;
const MAX_SHOULDER_TILT_DEG = 15;
/**
 * 머리 좌우 기울기(도) 한계. 목을 옆으로 젖힌 채 등록하면 그 기울기가 기준선이 되어
 * 스터디방에서 어깨·목 판정이 전부 어긋난다. 서버 모델은 거북목·어깨 높낮이만 봐서
 * 이 자세를 잡지 못하므로 기하 검사가 막아야 한다.
 */
const MAX_HEAD_ROLL_DEG = 15;

/**
 * 서버에 지금 자세를 물어보는 주기(ms). 스터디룸의 posture-frames 와 같은 1Hz 다.
 *
 * 기하 검사만으로는 거북목을 못 잡는다. 정면 웹캠에서 목이 앞으로 나온 것은 좌우 좌표로 드러나지
 * 않아서(카메라 쪽으로 오는 움직임이다) 절대 임계값을 만들 수 없다. 학습된 모델은 깊이 피처
 * (ear_z_rel·nose_z_rel)를 쓰고 기준선도 필요 없으므로 캘리브레이션 전에도 답할 수 있다.
 */
const PREVIEW_INTERVAL_MS = 1000;

/** 서버 판정이 이 심각도 이상이면 등록을 막는다. 스터디룸의 경고 기준과 같은 값이다 */
const PREVIEW_ALERT_SEVERITY = ALERT_SEVERITY;

/**
 * 이보다 오래된 피처는 믿지 않는다(ms). 영상이 멈추면 랜드마크 루프만 죽고 기하 검사도
 * 마지막 판정에 얼어붙는다 — 그 박제된 '통과' 상태로 기준 자세가 등록되면 안 되므로,
 * 묵은 피처가 감지되면 사람을 못 찾는 상태로 되돌린다(스터디룸의 STALE_FEATURES_MS 와 짝).
 */
const STALE_FEATURES_MS = 2_000;

/** 서버 자세 종류 → 화면에 보여줄 사유 */
const SERVER_REASON: Record<PostureType, PostureBlockedReason> = {
  FORWARD_HEAD: 'FORWARD_HEAD',
  SHOULDER_TILT: 'SHOULDER_UNEVEN',
};

/**
 * 기준 자세 등록 버튼이 안 켜지는 이유.
 *
 * 나누지 않으면 세 상황이 "자세 확인 중"이라는 한 문구로 뭉친다 — 사람을 찾는 중인 것과,
 * 고개를 숙여서 통과하지 못하는 것은 사용자가 할 일이 정반대다. 후자는 기다려도 영영
 * 안 켜지는데 문구는 기다리면 될 것처럼 읽힌다.
 *
 * 턱 괴기의 ChinRestBlockedReason 과 같은 이유로 둔다.
 */
export type PostureBlockedReason =
  | 'NO_PERSON' // 코·양 어깨 중 하나라도 안 잡힘
  | 'HEAD_DOWN' // 고개를 과하게 숙임
  | 'HEAD_TILTED' // 고개를 옆으로 젖힘
  | 'SHOULDER_TILTED' // 어깨가 한쪽으로 기울어짐
  | 'FORWARD_HEAD' // 목이 앞으로 나옴 — 서버 모델 판정
  | 'SHOULDER_UNEVEN'; // 어깨 높낮이 — 서버 모델 판정

/**
 * 화면에 내 라인을 그리는 데 필요한 한 프레임분 값.
 *
 * 랜드마크는 0~1 정규화 좌표라 그 자체로는 화면 어디인지 알 수 없다. 원본 프레임 크기를
 * 같이 담아야 받는 쪽이 표시 영역(object-fit·거울 반전)에 맞춰 옮길 수 있다.
 */
export interface PosePreviewFrame {
  landmarks: NormalizedLandmark[];
  width: number;
  height: number;
}

export interface PostureDetectionResult {
  status: DetectionStatus;
  /**
   * 지금 통과를 막고 있는 것. null 이면 이 프레임은 통과했다(연속 프레임을 채우는 중이거나 이미 완료).
   *
   * status 가 'detecting' 인데 이 값이 null 이면 "곧 켜진다"는 뜻이고, 값이 있으면
   * "고치지 않으면 안 켜진다"는 뜻이다. 화면이 그 둘을 다르게 안내해야 한다.
   */
  blockedReason: PostureBlockedReason | null;
  /**
   * 같은 프레임에서 뽑은 서버 계약용 피처. 캘리브레이션 표본 수집에 쓴다.
   *
   * 초당 30회 바뀌는 값이라 state 로 내보내면 화면이 그만큼 다시 그려진다.
   * 읽는 쪽이 필요한 주기로 꺼내 쓰도록 ref 로 준다.
   */
  latestFeatures: RefObject<PostureFeatures | null>;
  /**
   * 같은 프레임의 랜드마크 원본. 준비 화면이 '내 어깨선·머리 원'을 그리는 데 쓴다.
   *
   * latestFeatures 와 같은 이유로 ref 다 — 초당 30회 바뀌는 값이라 state 로 내보내면
   * 화면이 그만큼 다시 그려진다. 사람이 안 잡힌 프레임은 null 이다.
   */
  latestPose: RefObject<PosePreviewFrame | null>;
}

/**
 * MediaPipe PoseLandmarker 로 사람·자세를 판정한다.
 * - personFound: 상반신(양 어깨·코)이 충분한 신뢰도로 잡히는가
 * - isGoodPosture: 정면을 향하고 과도하게 기울거나 숙이지 않았는가
 */
export function usePostureDetection(
  videoRef: RefObject<HTMLVideoElement | null>,
  enabled: boolean,
): PostureDetectionResult {
  const [state, setState] = useState<{
    status: DetectionStatus;
    blockedReason: PostureBlockedReason | null;
  }>({ status: 'detecting', blockedReason: null });
  const okCountRef = useRef(0);
  const statusRef = useRef<DetectionStatus>('detecting');
  const reasonRef = useRef<PostureBlockedReason | null>(null);

  const latestFeatures = useRef<PostureFeatures | null>(null);
  /** latestFeatures 를 뽑은 시각. 영상이 멈춘 채 옛 값으로 통과되는 것을 막는다 */
  const latestFeaturesAt = useRef(0);
  const latestPose = useRef<PosePreviewFrame | null>(null);
  /**
   * 서버 모델이 마지막으로 알려준 나쁜 자세. null 이면 정상이거나 아직 답을 못 받았다.
   *
   * 1Hz 로 갱신되는데 프레임 판정은 30Hz 라, 매 프레임이 이 값을 읽어 통과 여부에 반영한다.
   * 답을 못 받은 동안은 null 로 둬서 통과를 막지 않는다 — 서버가 잠깐 안 되는 동안 입장 자체가
   * 막히면 공부를 못 하게 되고, 그건 나쁜 기준선보다 나쁘다.
   */
  const serverReason = useRef<PostureBlockedReason | null>(null);

  const apply = useCallback(
    (next: DetectionStatus, reason: PostureBlockedReason | null) => {
      // 둘 중 하나라도 바뀔 때만 setState — 초당 30회 리렌더 방지
      if (next === statusRef.current && reason === reasonRef.current) return;
      statusRef.current = next;
      reasonRef.current = reason;
      setState({ status: next, blockedReason: reason });
    },
    [],
  );

  // 비활성화되면 다음 활성화 때 처음부터 판정하도록 상태를 되돌린다.
  // setState 를 다음 틱으로 미루는 것은 프로젝트 린트 규칙(react-hooks/set-state-in-effect)
  // 때문이다 — 졸음·휴대폰 훅의 비활성화 처리도 같은 방식이다.
  useEffect(() => {
    if (enabled) return;
    okCountRef.current = 0;
    statusRef.current = 'detecting';
    reasonRef.current = null;
    latestFeatures.current = null;
    latestPose.current = null;
    const id = setTimeout(
      () => setState({ status: 'detecting', blockedReason: null }),
      0,
    );
    return () => clearTimeout(id);
  }, [enabled]);

  const handleFrame = useCallback(
    (lms: NormalizedLandmark[] | null, width: number, height: number) => {
      let personFound = false;
      // 이 프레임이 통과를 못 한 이유. null 이면 통과다.
      let reason: PostureBlockedReason | null = 'NO_PERSON';

      if (lms) {
        const m = computeMetrics(lms, width, height);
        const vis = (i: number) => lms[i].visibility ?? 1;
        // 코(0) · 양 어깨(11,12)가 모두 보여야 판정 가능
        personFound =
          m !== null &&
          vis(0) > MIN_VISIBILITY &&
          vis(11) > MIN_VISIBILITY &&
          vis(12) > MIN_VISIBILITY;

        if (personFound && m) {
          // 먼저 걸린 하나만 알린다. 두 가지를 동시에 띄우면 무엇부터 고쳐야 할지 흐려진다.
          // 기하 검사(촬영 가능한지)를 서버 판정(자세가 좋은지)보다 앞세운다 — 고개를 푹 숙인
          // 프레임은 모델에 넣어도 값을 믿을 수 없어서, 그것부터 고쳐야 다음 말이 의미를 갖는다.
          if (Math.abs(m.headPitch) >= MAX_HEAD_PITCH) {
            reason = 'HEAD_DOWN';
          } else if (Math.abs(m.headRoll) >= MAX_HEAD_ROLL_DEG) {
            reason = 'HEAD_TILTED';
          } else if (Math.abs(m.shoulderTilt) >= MAX_SHOULDER_TILT_DEG) {
            reason = 'SHOULDER_TILTED';
          } else {
            reason = serverReason.current;
          }
        }

        // 판정과 별개로, 같은 프레임에서 서버 계약용 피처도 뽑아 둔다.
        // 여기서 안 뽑으면 캘리브레이션이 루프를 따로 돌려야 하고, 그러면
        // 랜드마커 싱글턴에 루프가 둘 붙는다.
        latestFeatures.current = extractPostureFeatures(lms, width, height);
        latestFeaturesAt.current = Date.now();
        // 사람이 잡혔을 때만 내보낸다. 신뢰도가 낮은 프레임까지 그리면 선이 엉뚱한 곳에서
        // 튄다 — 화면에 보이는 것은 '지금 인식된 내 위치'여야 한다.
        latestPose.current = personFound
          ? { landmarks: lms, width, height }
          : null;
      } else {
        latestFeatures.current = null;
        latestPose.current = null;
      }

      okCountRef.current = reason === null ? okCountRef.current + 1 : 0;

      if (!personFound) apply('not-found', 'NO_PERSON');
      else if (okCountRef.current >= VERIFY_FRAMES) apply('verified', null);
      else apply('detecting', reason);
    },
    [apply],
  );

  const handleLoadError = useCallback(
    () => apply('not-found', 'NO_PERSON'),
    [apply],
  );

  usePoseStream(videoRef, enabled, handleFrame, handleLoadError);

  /**
   * 1초에 한 번 서버 모델에 지금 자세를 물어본다.
   *
   * setState 를 하지 않고 ref 에만 담는다 — 화면에 보이는 것은 매 프레임 판정이 만드는
   * blockedReason 이고, 이 값은 그 판정의 입력이다. 여기서 setState 하면 초마다 리렌더가 하나 늘고
   * 매 프레임 계산과 순서도 어긋난다.
   */
  useEffect(() => {
    if (!enabled) {
      serverReason.current = null;
      return;
    }

    let cancelled = false;
    // 응답이 1초보다 오래 걸릴 때 요청이 겹치지 않도록 한 번에 한 건만 보낸다(스터디룸과 같은 방식).
    let inFlight = false;

    const timer = setInterval(async () => {
      const features = latestFeatures.current;
      // 사람이 안 잡힌 프레임은 보내지 않는다. 그건 기하 검사가 NO_PERSON 으로 이미 막는다.
      if (features === null || inFlight) return;

      // 영상이 멈추면 기하 검사(30fps)가 얼어붙어 마지막 '통과' 상태가 그대로 남는다.
      // 이 타이머(1Hz)는 계속 돌므로 여기서 알아채고 사람 못 찾음으로 되돌린다 —
      // 박제된 자세로 버튼이 켜져 있거나 수집이 이어지면 안 된다.
      if (Date.now() - latestFeaturesAt.current >= STALE_FEATURES_MS) {
        serverReason.current = null;
        okCountRef.current = 0;
        apply('not-found', 'NO_PERSON');
        return;
      }

      inFlight = true;
      try {
        const res = await previewPostureFrame(features);
        if (cancelled) return;
        // 보류(severity=null)는 나쁨이 아니다. 가려진 프레임을 나쁨으로 처리하면 등록이 막힌다.
        const bad = POSTURE_TYPES.find((type) => {
          const j = res.judgements.find((x) => x.type === type);
          return j?.severity != null && j.severity >= PREVIEW_ALERT_SEVERITY;
        });
        serverReason.current = bad === undefined ? null : SERVER_REASON[bad];
      } catch (e) {
        if (cancelled) return;
        // 못 물어봤으면 막지 않는다. 판정을 못 하는 것과 자세가 나쁜 것은 다르다.
        serverReason.current = null;
        if (import.meta.env.DEV) {
          console.warn(
            '[preparation] 자세 미리 판정 실패 — 등록을 막지 않는다',
            e,
          );
        }
      } finally {
        inFlight = false;
      }
    }, PREVIEW_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearInterval(timer);
      serverReason.current = null;
    };
  }, [enabled, apply]);

  return { ...state, latestFeatures, latestPose };
}
