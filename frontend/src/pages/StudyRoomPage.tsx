// src/pages/StudyRoomPage.tsx
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';

import { getMyOnboarding } from '@/api/onboardingApi';
import { getCalibration } from '@/api/postureApi';
import { getStretchings } from '@/api/stretchingApi';
import { endStudyRecord, getStudyRecord } from '@/api/studyRecordApi';
import {
  getRoomTimerState,
  getStudyRoom,
  joinRoom,
  leaveRoom,
  startRoomTimer,
} from '@/api/studyRoomApi';
import DevControls from '@/components/dev/DevControls';
import type { DevState } from '@/components/dev/DevControls';
import CoachingHeaderBadge from '@/components/study/CoachingHeaderBadge';
import CoachingStage from '@/components/study/CoachingStage';
import CoachingStatusBar from '@/components/study/CoachingStatusBar';
import DetectionAlert from '@/components/study/DetectionAlert';
import PhoneBoxOverlay from '@/components/study/PhoneBoxOverlay';
import PipParkedCover from '@/components/study/PipParkedCover';
import PostureLights from '@/components/study/PostureLights';
import RoomControlBar from '@/components/study/RoomControlBar';
import RoomSidebar from '@/components/study/RoomSidebar';
import StretchingCallPanel from '@/components/study/StretchingCallPanel';
import StretchingOverlay from '@/components/study/StretchingOverlay';
import StudyPipPanel from '@/components/study/StudyPipPanel';
import type {
  PipDetectChip,
  PipLightItem,
  PipWarning,
} from '@/components/study/StudyPipPanel';
import TimerSettingsDialog from '@/components/study/TimerSettingsDialog';
import VideoGrid from '@/components/study/VideoGrid';
import { ExitIcon, UsersIcon } from '@/components/study/icons';
import { useBackgroundEffect } from '@/hooks/useBackgroundEffect';
import { useCamera } from '@/hooks/useCamera';
import {
  CHIN_REST_HOLD_SECONDS,
  CHIN_REST_RELEASE_SECONDS,
  useChinRestDetection,
} from '@/hooks/useChinRestDetection';
import { useCoaching } from '@/hooks/useCoaching';
import { useDocumentPip } from '@/hooks/useDocumentPip';
import { useDrowsinessDetection } from '@/hooks/useDrowsinessDetection';
import { useSessionUnloadFlush } from '@/hooks/useSessionUnloadFlush';
import { usePhoneDetection } from '@/hooks/usePhoneDetection';
import {
  POSTURE_RECOVERY_SECONDS,
  POSTURE_WINDOW_SECONDS,
  usePostureFrames,
} from '@/hooks/usePostureFrames';
import type { PoseFrameHandler } from '@/hooks/usePoseStream';
import { usePostureHighlights } from '@/hooks/usePostureHighlights';
import {
  useOpenVidu,
  usePublishedVideoTrack,
  usePublisherToggles,
  useScreenShare,
} from '@/hooks/useOpenVidu';
import { useRoomSocket } from '@/hooks/useRoomSocket';
import { useStudyProgressSync } from '@/hooks/useStudyProgressSync';
import { useStretchDetection } from '@/hooks/useStretchDetection';
import { useSessionTimelapse } from '@/hooks/useSessionTimelapse';
import { useStretching } from '@/hooks/useStretching';
import { useVoiceGuidance } from '@/hooks/useVoiceGuidance';
import { useAuthStore } from '@/stores/useAuthStore';
import { useRoomEntryStore } from '@/stores/useRoomEntryStore';
import { POSTURE_TYPE_TO_CHECK } from '@/types/coaching';
import { POSTURE_TYPES, toPostureLight } from '@/types/posture';
import type { PostureBaseline, PostureLight } from '@/types/posture';
import type { StudyEndResult, StudySessionSummary } from '@/types/studyRecord';
import type {
  CoachingState,
  Participant,
  StudyRoomDetailDto,
} from '@/types/room';
import {
  DETECT_PART_ADVICE,
  DETECT_PART_LABEL,
  DETECT_PART_ORDER,
  STRETCHING_STEPS,
  TRIGGER_LABEL,
  toStep,
} from '@/types/stretching';
import type {
  Stretching,
  StretchingPhase,
  TargetPart,
} from '@/types/stretching';
import {
  readBackgroundEffect,
  writeBackgroundEffect,
} from '@/utils/backgroundEffect';
import type { BackgroundEffect } from '@/utils/backgroundEffect';
import { formatDuration } from '@/utils/formatDuration';
import { readRoomPassword } from '@/utils/roomPassword';
import {
  readCameraOn,
  readMicOn,
  writeCameraOn,
  writeMicOn,
} from '@/utils/mediaToggles';
import { readVoiceGuidance, writeVoiceGuidance } from '@/utils/voiceGuidance';
import styles from './StudyRoomPage.module.css';

// 한 부위가 이 횟수에 닿으면 스트레칭 강제 진입.
//
// 5회였다가 3회로 낮췄다. 경고 하나가 뜨는 데 자세 관찰 구간(POSTURE_WINDOW_SECONDS)이
// 통째로 필요해서, 5회면 한 부위로만 계산해도 그 다섯 배가 걸린다. 그 사이 자세를 한 번이라도
// 펴면 카운트가 더 늘어지고, 정작 스트레칭이 필요한 사람이 스트레칭 화면을 못 본 채 세션이 끝난다.
//
// 관찰 구간이 30초일 때는 5회가 2분 30초였다. 지금은 10초라 3회면 30초다 — 구간을 다시
// 늘리면 이 값도 같이 봐야 한다.
const MAX_WARNING_COUNT = 3;
const AWAY_THRESHOLD_SECONDS = 300;

/**
 * 방장 화면이 방 타이머가 살아 있는지 다시 확인하는 주기(ms).
 * 살아 있으면 아무 일도 하지 않으므로 화면에는 아무 변화가 없다.
 */
const TIMER_HEALTH_CHECK_MS = 30_000;

/**
 * 사람이 이 시간 이상 안 잡히면 자리비움으로 보고 순공 시간을 멈춘다.
 *
 * 짧게 잡으면 화면 밖으로 살짝 기울이거나 물을 마실 때마다 순공이 끊긴다.
 * 길게 잡으면 그 시간만큼은 자리를 비워도 공부한 것으로 계산된다.
 * 위 AWAY_THRESHOLD_SECONDS(5분)는 카메라를 끈 경우의 안내 문구용 값이고,
 * 이건 사람이 화면에서 사라진 경우라 기준이 훨씬 짧아야 한다.
 */
const AWAY_AFTER_MISSING_SECONDS = 20;

/**
 * 곁들이는 카운트다운 표시. 1시간 미만이면 시 자리를 떼어 '12:34' 로 짧게 쓴다.
 * 옆에 붙는 보조 문구라 '00:12:34' 는 길기만 하고 읽기 어렵다.
 */
function formatCountdown(seconds: number): string {
  const text = formatDuration(seconds);
  return text.startsWith('00:') ? text.slice(3) : text;
}

/**
 * 이보다 창이 좁아지면 채팅·참여자 사이드바를 접는다. 영상이 밀려 사라지지 않게 하려는 것이다.
 * 960px 은 1920px 모니터의 절반 — 창 크기만 알 수 있어서 모니터가 다르면 체감 시점도 달라진다.
 */
const NARROW_WINDOW_QUERY = '(max-width: 960px)';

// 참여자 목록·채팅은 useRoomSocket 이 실시간으로 받아 온다.
// POSTURE_WINDOW_SECONDS 는 usePostureFrames 에서 가져온다 — 신호등과 결과 화면이
// 같은 값을 봐야 하므로 여기서 다시 선언하지 않는다.

const INITIAL_DEV_STATE: DevState = {
  coachMode: null,
  severity: null,
  incomingFriendRequests: false,
  // null = 서버 기본값(app.posture.detector). 개발 패널에서만 바꿀 수 있다.
  detector: null,
};

/** 감지 대상 부위 — 이 순서대로 임계치 도달 여부를 본다 */
const DETECT_PARTS: TargetPart[] = ['NECK', 'SHOULDER', 'BACK'];

/**
 * 자동으로 시키는 스트레칭이 도는 순서(stretchings.name 기준).
 *
 * 여기 없는 이름은 뒤로 밀리고, 그들끼리는 서버가 준 sort_order 를 따른다.
 * 이름이 바뀌거나 동작이 늘어도 목록에서 빠지지 않게 하려는 것이다.
 */
const STRETCH_ORDER = [
  '목 돌리기',
  '목 옆으로 기울이기',
  '목 대각선 스트레칭',
  '어깨 으쓱하기',
  '어깨 돌리기',
  '크로스바디 스트레칭',
];

function stretchRank(s: Stretching): number {
  const i = STRETCH_ORDER.indexOf(s.name);
  return i === -1 ? STRETCH_ORDER.length : i;
}

/**
 * 서버 자세 판정 종류 → 스트레칭 부위.
 * 어느 부위 스트레칭을 시킬지 정하는 데 쓴다.
 *
 * BACK 자리는 턱 괴기가 쓴다 — 아래 chinRest 참고.
 */
const POSTURE_TYPE_TO_PART: Record<string, TargetPart> = {
  FORWARD_HEAD: 'NECK',
  SHOULDER_TILT: 'SHOULDER',
};

/**
 * 작은 창(PiP)의 처음 크기.
 *
 * 높이는 내용물(시간·카운터·상태 한 줄 + 16:9 영상)에 맞춘 값이다. 예전 560은
 * 영상 위아래가 검은 여백으로 남았다 — 영상 칸이 16:9 로 고정되면서(모듈 CSS 참고)
 * 남는 높이가 생기지 않게 줄였고, 돌아가기 버튼도 아이콘으로 합쳐 한 줄 아꼈다.
 * 사용자가 창 모서리를 끌어 조절할 수 있다.
 */
const PIP_WINDOW_SIZE = { width: 380, height: 380 };

/**
 * 자세 경고가 이어지는 동안 같은 안내를 다시 읽어 주는 주기(ms).
 *
 * 확정 순간 한 번만 읽으면 거북목처럼 한번 잡히면 유지되는 자세에서 소용이 없다 —
 * 그 한 번을 놓치면 화면에 경고가 떠 있어도 다시는 안 들린다. 자세를 고치면(2초) 경고가
 * 내려가면서 같이 멈추므로, 고친 사람에게 계속 말하지는 않는다.
 */
const POSTURE_REMINDER_MS = 20_000;

/**
 * 작은 창을 쓸 수 없는 브라우저라는 안내. 컨트롤바 버튼의 툴팁으로만 쓴다.
 *
 * 실패를 방 안 배너로 알리던 것은 걷어냈다. 자동 전환이 막히는 경우가 대표적인데, 그건
 * 사용자가 <b>다른 창으로 넘어가는 순간</b> 일어난다 — 정작 그 배너가 뜨는 방 화면은 그때
 * 보고 있지 않다. 나중에 돌아왔을 때 이미 지나간 일을 알리는 셈이라, 읽을 이유가 없는
 * 경고만 하나 더 쌓였다. 작은 창이 필요하면 컨트롤바 버튼으로 직접 열면 된다.
 */
const PIP_UNSUPPORTED_NOTICE =
  '이 브라우저는 작은 창(PiP)을 지원하지 않습니다. Chrome 또는 Edge 116 이상에서 사용할 수 있습니다.';

/**
 * 지금 상태에서 사용자가 알아야 할 것을 한 줄로 만든다. 정상이면 null.
 *
 * <p>
 * 두 가지를 알린다. 하나는 권한이 막혀 못 내보내는 장치, 다른 하나는 카메라가 꺼져 있어
 * 공부 시간이 기록되지 않는다는 사실이다.
 *
 * <p>
 * 둘 다 화면만 봐서는 알 수 없다. 브라우저는 요청한 장치 중 하나만 막혀도 전체를 거부해서,
 * 마이크만 껐다고 생각한 사용자가 영상까지 안 나가는 상태가 된다. 카메라를 끄면 타이머가
 * 멈추는 것도 마찬가지로 조용히 일어난다.
 */
export default function StudyRoomPage() {
  const { roomId } = useParams<{ roomId: string }>();
  const navigate = useNavigate();
  const verifiedRoomId = useRoomEntryStore((s) => s.verifiedRoomId);
  const studyRecordId = useRoomEntryStore((s) => s.studyRecordId);
  const rollOverStudyRecord = useRoomEntryStore((s) => s.rollOverStudyRecord);
  const clearEntry = useRoomEntryStore((s) => s.clear);
  const setVerified = useRoomEntryStore((s) => s.setVerified);
  const mediaToken = useRoomEntryStore((s) => s.mediaToken);
  const memberId = useAuthStore((s) => s.member?.memberId ?? null);
  const myProfileImage = useAuthStore((s) => s.member?.profileImageUrl);
  // 로그인 응답에 member 가 통째로 들어오므로 GET /members/me 를 따로 부르지 않는다.
  const userName = useAuthStore((s) => s.member?.nickname ?? '');

  /** 나가기 중복 클릭 방지 */
  const [leaving, setLeaving] = useState(false);
  /** 이번 세션에서 스트레칭을 마친 횟수 (결과 화면용). 카운터와 같은 이유로 스토어에 둔다 */
  const stretchingDoneCount = useRoomEntryStore((s) => s.stretchingDoneCount);
  const countStretchingDone = useRoomEntryStore((s) => s.countStretchingDone);
  /** 학습·쉬는 시간 변경 창 (방장 전용) */
  const [timerDialogOpen, setTimerDialogOpen] = useState(false);

  const [room, setRoom] = useState<StudyRoomDetailDto | null>(null);
  // 방 실시간 연결 — 참여자 입퇴장·채팅이 여기로 들어온다.
  /**
   * 같은 계정이 다른 탭에서 이 방에 들어오면 이 화면은 밀려난다.
   *
   * 서버에는 새 탭이 참여자로 남아 있으므로 퇴장 API는 부르지 않는다.
   * 이 화면만 정리하고 홈으로 보낸다.
   */
  const handleEvicted = useCallback(() => {
    clearEntry();
    alert('다른 창에서 이 스터디룸에 접속해 현재 창은 종료됩니다.');
    navigate('/');
  }, [clearEntry, navigate]);

  const {
    participants: roomParticipants,
    messages,
    timerState,
    sendMessage,
    sendMediaState,
    sendCoachingState,
  } = useRoomSocket(roomId, handleEvicted);

  /**
   * 방 타이머가 공부가 아닌 구간인지.
   *
   * 서버 사이클은 집중 → (스트레칭) → (휴식) → 집중 순서다. 스트레칭도 공부가 아니므로
   * 휴식과 똑같이 순공 시간을 멈추고, 화면에도 둘 다 '쉬는 시간'으로 보여준다.
   *
   * 페이즈는 방 전원이 같은 브로드캐스트로 받으므로, 멈추고 다시 흐르는 시점도 모두 같다.
   *
   * 아래 감지 훅들이 이 값을 보고 멈추므로 그것들보다 먼저 선언한다.
   */
  const timerResting =
    timerState.running &&
    (timerState.phase === 'BREAK' || timerState.phase === 'STRETCHING');

  // 새로고침하면 화상 토큰이 사라진다(한 번 쓰면 못 쓰는 값이라 저장하지 않는다).
  // 입장 기록은 그대로 있으므로 입장 API를 다시 불러 새 토큰만 받아 온다.
  useEffect(() => {
    if (mediaToken || verifiedRoomId !== roomId || !roomId) return;
    const numericRoomId = Number(roomId);
    if (!Number.isInteger(numericRoomId) || numericRoomId <= 0) return;

    let alive = true;
    joinRoom(numericRoomId, {
      cameraChecked: true,
      postureChecked: true,
      // 새로고침으로 토큰만 다시 받는 길이라 잠긴 방이면 비밀번호도 같이 보내야 한다.
      password: readRoomPassword(roomId),
    })
      .then((joined) => {
        if (alive) setVerified(roomId, joined.studyRecordId, joined.mediaToken);
      })
      .catch((e) => {
        // 토큰을 못 받아도 채팅·참여자는 동작한다. 화면만 안 나온다.
        console.error('[재입장] 화상 토큰 재발급 실패', e);
      });
    return () => {
      alive = false;
    };
  }, [mediaToken, roomId, verifiedRoomId, setVerified]);

  // 화상 연결 — 입장 때 받은 토큰으로 붙고, 다른 참여자 영상을 받아 온다.
  const { publisher, remotes, publishState } = useOpenVidu(mediaToken, {
    memberId,
    nickname: userName,
  });

  // memberId 로 참여자 타일과 영상을 짝짓는다.
  const remoteStreams = useMemo(() => {
    const map = new Map<string, (typeof remotes)[number]['manager']>();
    remotes.forEach((r) => {
      if (r.memberId) map.set(r.memberId, r.manager);
    });
    return map;
  }, [remotes]);

  // 방 정보(제목·정원) 조회. 참여자 수는 입장 시점 스냅샷이며, WebSocket 연동 후 실시간으로 대체한다.
  // 방 번호가 유효하지 않으면 호출하지 않는다 (/study-rooms/NaN 은 400 이다).
  useEffect(() => {
    const numericRoomId = Number(roomId);
    if (!Number.isInteger(numericRoomId) || numericRoomId <= 0) return;
    let alive = true;
    getStudyRoom(numericRoomId)
      .then((data) => {
        if (alive) setRoom(data);
      })
      .catch(() => {
        if (alive) setRoom(null);
      });
    return () => {
      alive = false;
    };
  }, [roomId]);

  const {
    videoRef,
    attachVideo,
    status: cameraStatus,
    setVideoEnabled,
  } = useCamera();
  const [dev, setDev] = useState<DevState>(INITIAL_DEV_STATE);
  /**
   * 사이드바 펼침 여부. 처음 값은 현재 창 폭으로 정하고, 그 뒤로는 폭이 경계를 넘을 때마다
   * 따라 바뀐다. 버튼으로 누른 선택도 다음 경계 통과 전까지는 그대로 유지된다.
   */
  const [sidebarOpen, setSidebarOpen] = useState(
    () => !window.matchMedia(NARROW_WINDOW_QUERY).matches,
  );

  useEffect(() => {
    const query = window.matchMedia(NARROW_WINDOW_QUERY);
    const handleChange = (e: MediaQueryListEvent) => setSidebarOpen(!e.matches);
    query.addEventListener('change', handleChange);
    return () => query.removeEventListener('change', handleChange);
  }, []);

  // 새로고침해도 지난번에 고른 대로 시작한다. 카메라를 끄고 공부하던 사람이 새로고침
  // 한 번에 얼굴이 다시 켜지면 안 된다(utils/mediaToggles 주석 참고).
  const [micOn, setMicOn] = useState(readMicOn);
  const [cameraOn, setCameraOn] = useState(readCameraOn);
  // 토글 상태를 실제 송출에도 반영한다. 이게 없으면 껐다고 표시만 되고 상대에겐 계속 나간다.
  usePublisherToggles(publisher, cameraOn, micOn);

  // 판정용 로컬 카메라 트랙도 토글을 따라간다. 토글 순간에만 껐다 켜면, 꺼짐을 기억한 채
  // 들어왔을 때 내 화면에는 영상이 그대로 나온다. 카메라가 준비된 뒤에 다시 맞춰야 하므로
  // status 도 함께 본다 — 스트림이 오기 전에 부르면 아무 일도 일어나지 않는다.
  useEffect(() => {
    setVideoEnabled(cameraOn);
  }, [cameraOn, cameraStatus, setVideoEnabled]);

  // 권한이 막혀 못 내보내는 장치는 화면 표시도 꺼짐으로 맞춘다.
  // 켜진 것처럼 두면 본인도 상대도 목소리·영상이 나가는 줄 알고 그대로 있게 된다.
  useEffect(() => {
    if (publishState === 'video-only' || publishState === 'none')
      setMicOn(false);
    if (publishState === 'audio-only' || publishState === 'none')
      setCameraOn(false);
  }, [publishState]);

  /**
   * 배경 효과 — 사람만 남기고 배경을 흐리게 한다.
   *
   * 처음 값은 이 사람이 마지막으로 고른 값이다(utils/backgroundEffect 참고).
   * 기본은 꺼짐이라, 아무것도 건드리지 않은 사람에게는 예전과 똑같이 동작한다.
   */
  const [backgroundEffect, setBackgroundEffect] =
    useState(readBackgroundEffect);
  const bgEffect = useBackgroundEffect(videoRef, backgroundEffect, cameraOn);
  // 아래 handleLandmarks 의 의존성으로 쓴다. 객체째 넣으면 렌더마다 새로 만들어져
  // 자세 판정 쪽 콜백까지 매번 다시 만들어진다.
  const bgEffectLandmarks = bgEffect.onLandmarks;

  /**
   * 화면 공유가 끝났을 때 되돌릴 트랙.
   *
   * 배경 효과가 켜져 있는데 원본 카메라로 돌아가면, 공유를 한 번 켰다 끈 것만으로
   * 흐림이 조용히 풀린다 — 본인 화면에는 캔버스가 그대로 덮여 있어서 알아채기도 어렵다.
   */
  const restoreShareTrack = useCallback(() => bgEffect.track, [bgEffect.track]);

  // 화면 공유 — 내 송출 영상만 카메라 ↔ 화면으로 바꾼다.
  const screenShare = useScreenShare(publisher, restoreShareTrack);

  // 배경 효과를 상대에게도 보낸다. 공유 중에는 그쪽이 트랙을 쥐고 있으므로 손대지 않는다.
  usePublishedVideoTrack(publisher, bgEffect.track, screenShare.sharing);

  // 내 카메라·마이크·화면공유 상태를 방에 알린다. 영상이 끊기는 것과 별개로,
  // 상대 화면에 "카메라 꺼짐" 같은 표시가 뜨려면 이 값이 필요하다.
  useEffect(() => {
    sendMediaState({ cameraOn, micOn, screenSharing: screenShare.sharing });
  }, [cameraOn, micOn, screenShare.sharing, sendMediaState]);
  /** 이번 세션의 순공 시간(초). 자리비움·졸음 구간은 여기서 빠진다 */
  const [elapsed, setElapsed] = useState(0);
  /**
   * 이번 세션에서 순공에서 빼낸 시간(초) — 자리비움·졸음.
   *
   * 버리지 않고 따로 모아 두면 서버가 total(= focused + break + away)을 만들 수 있고,
   * 집중도 점수(focused / total)가 비로소 의미를 갖는다. 버리면 total 이 곧 focused 라
   * 집중도가 항상 100 점이 된다.
   */
  const [awayElapsed, setAwayElapsed] = useState(0);
  /**
   * 이번 세션의 휴식 시간(초) — 스트레칭·쉬는 시간.
   *
   * 이 구간에는 순공도 자리비움도 멈춘다. 그런데 서버로 보내는 값에서까지 빠지면 그 시간이
   * 어디에도 남지 않는다. 서버는 나쁜 자세 시간을 자기 시계로 재므로, 사라진 시간만큼
   * 두 숫자의 기준이 어긋나 자세 유지율이 실제보다 나쁘게 나온다.
   */
  const [breakElapsed, setBreakElapsed] = useState(0);
  /**
   * 부위별 나쁜 자세 누적 감지 횟수.
   * 서버가 지속을 확정할 때마다 1씩 오른다 — 화면에서 올릴 수단은 없다.
   * 한 부위가 MAX_WARNING_COUNT 에 도달하면 그 부위 스트레칭이 시작된다.
   *
   * 화면 상태가 아니라 입장 스토어에 있다. 새로고침해도 남아야 하는 값이라서다
   * (useRoomEntryStore 주석 참고).
   */
  const detectCounts = useRoomEntryStore((s) => s.detectCounts);
  const updateDetectCounts = useRoomEntryStore((s) => s.updateDetectCounts);
  // DB에 등록된 스트레칭 가이드 목록과, 이번에 뽑힌 동작
  const [stretchings, setStretchings] = useState<Stretching[]>([]);
  const [pickedStretching, setPickedStretching] = useState<Stretching | null>(
    null,
  );
  // 자동 스트레칭 차례. 스트레칭을 닫을 때 advanceStretch 로 한 칸 넘긴다(스토어 주석 참고).
  const stretchTurn = useRoomEntryStore((s) => s.stretchTurn);
  const advanceStretch = useRoomEntryStore((s) => s.advanceStretch);
  /** 개인 기준선 — 스트레칭 판정에서 어깨 높이 기준으로 쓴다 */
  const [baseline, setBaseline] = useState<PostureBaseline | null>(null);
  /**
   * 졸음 감지 동의 여부. 조회 전에는 null 이고, 그동안은 감지하지 않는다.
   *
   * 졸음 판정은 눈을 들여다보는 일이라 동의 없이 켜면 안 된다. 온보딩 화면이
   * "졸음·자세 감지는 내 브라우저에서만 처리된다"고 약속하고 동의를 받는다.
   */
  const [drowsinessConsent, setDrowsinessConsent] = useState<boolean | null>(
    null,
  );
  /**
   * 학습 장면 저장 동의 여부. 조회 전에는 null 이고, 그동안은 담지 않는다.
   *
   * 서버로 보내지 않고 브라우저 안에서만 쓰더라도, 얼굴이 담긴 사진을 10초마다 남긴다는
   * 사실 자체는 알리고 받아야 한다. 동의를 못 읽으면 끈 것으로 본다.
   */
  const [captureConsent, setCaptureConsent] = useState<boolean | null>(null);
  /**
   * 이 방에서 전에 공부한 시간(초). 아직 서버에서 못 읽었으면 null 이다.
   *
   * study_records 는 (방, 회원) 하나당 한 행이라(uk_study_records_room_member) 재입장해도
   * 같은 행을 다시 쓴다. 그런데 서버는 받은 값을 더하지 않고 덮어쓰므로, 이번 세션 시간만
   * 보내면 지난 기록이 지워진다. 입장할 때 기존 값을 읽어 두고 합쳐서 보낸다.
   *
   * 0 이 아니라 null 로 시작하는 이유는 "아직 모름"과 "정말 0 분"을 구분하기 위해서다.
   * 0 으로 두면 값이 도착하는 순간 화면의 시간이 훌쩍 뛴다.
   */
  const [priorFocusedSeconds, setPriorFocusedSeconds] = useState<number | null>(
    null,
  );
  /** 이 방에서 전에 자리비움으로 빠진 시간(초). focused 와 같은 이유로 합쳐 보내야 한다 */
  const [priorAwaySeconds, setPriorAwaySeconds] = useState(0);
  /** 이 방에서 전에 쉰 시간(초). focused 와 같은 이유로 합쳐 보내야 한다 */
  const [priorBreakSeconds, setPriorBreakSeconds] = useState(0);
  /**
   * 이 방에서 전에 흐른 전체 시간(초). 서버의 totalStudySeconds(집중+휴식+자리비움)다.
   * 아래 totalElapsed 의 출발점이라, 재입장해도 총 시간이 0 부터 다시 세지 않는다.
   */
  const [priorTotalSeconds, setPriorTotalSeconds] = useState(0);
  /**
   * 이 화면을 띄운 뒤 흐른 실제 시간(초). <b>어떤 이유로도 멈추지 않는다.</b>
   *
   * 순공 시간은 자리비움·졸음·쉬는 시간·자세 교정에 모두 멈춰서, 화면만 보면 앱이 죽은
   * 건지 규칙대로 멈춘 건지 구분이 안 된다. 옆에서 계속 흐르는 숫자가 하나 있으면
   * "멈춘 게 맞다"는 것이 바로 보인다.
   */
  const [totalElapsed, setTotalElapsed] = useState(0);

  /**
   * 자정을 지나 서버가 기록을 다음 날짜로 넘겼다.
   *
   * 세션 id 가 바뀌었으므로 갈아탄다. 이 id 는 자세 판정·스트레칭·타임랩스·종료가 모두 쓰는
   * 값이라, 스토어를 바꾸면 그 값을 읽는 곳들이 함께 따라온다.
   *
   * 시간 계산도 새 행 기준으로 되돌린다. 새 행은 넘겨받은 시간(carried)부터 시작하므로 그 값을
   * prior 로 삼고 이번 화면의 경과는 0 부터 다시 센다. 되돌리지 않으면 어제 몫이 오늘 행에
   * 다시 더해져 시간이 두 배로 보인다.
   */
  const handleRolledOver = useCallback(
    (nextStudyRecordId: number, carriedFocusedSeconds: number) => {
      rollOverStudyRecord(nextStudyRecordId);
      setPriorFocusedSeconds(carriedFocusedSeconds);
      setElapsed(0);
      setPriorAwaySeconds(0);
      setAwayElapsed(0);
      // 새 날짜의 기록은 휴식도 0 부터다. 안 비우면 어제 쉰 시간이 오늘 기록에 다시 더해진다.
      setPriorBreakSeconds(0);
      setBreakElapsed(0);
    },
    [rollOverStudyRecord],
  );

  // 임계치를 넘긴 부위가 있으면 그 부위 스트레칭을 띄운다
  const stretchTarget =
    DETECT_PARTS.find((p) => detectCounts[p] >= MAX_WARNING_COUNT) ?? null;
  const stretchingOpen = stretchTarget !== null;

  /**
   * 자세·휴대폰·졸음 판정을 모두 멈춰야 하는 상태인가.
   *
   * 두 경우다.
   *   - 스트레칭 중: 화면이 스트레칭 동작을 판정하고 있어 자세 판정과 겹친다.
   *   - 쉬는 시간(휴식·스트레칭 구간): 순공 시간이 이미 멈춰 있어 이 구간의 자세는
   *     점수에 들어가지 않는데, 경고만 뜨면 "쉬라면서 바르게 앉으라"는 말이 된다.
   *     휴대폰도 쉬는 시간에 보는 게 당연하고, 졸음 경고도 쉬는 사람에게는 잔소리다.
   *
   * 경고가 안 뜨면 스트레칭 트리거(경고 5회)도 쌓이지 않는다 — 쉬는 동안 쌓인 경고로
   * 다음 집중 구간이 시작하자마자 스트레칭이 뜨는 일이 없어진다.
   */
  const detectionOff = stretchingOpen || timerResting;

  /**
   * 작은 창(PiP) — 다른 일을 하는 동안에도 내 카메라와 자세 경고를 계속 볼 수 있게 한다.
   *
   * 이 창이 열려 있는 동안 로컬 영상은 그쪽으로 옮겨간다. 본 화면은 내 타일을 비워 두는데,
   * 로컬 스트림을 붙일 &lt;video&gt; 가 둘이 되면 감지 훅들이 어느 요소를 보는지가
   * 렌더 순서에 따라 달라지기 때문이다(StudyPipPanel 주석 참고).
   */
  const pip = useDocumentPip();
  const pipOpen = pip.pipWindow !== null;
  const openPip = pip.open;
  const closePip = pip.close;

  /** 스트레칭이 시작될 때 작은 창이 켜져 있었는지 — 미션을 마치면 그때 다시 켠다 */
  const pipWasOpenRef = useRef(false);
  /** 지금 스트레칭 단계. 완료로 끝난 경우에만 작은 창을 되돌린다 */
  const stretchingPhaseRef = useRef<StretchingPhase>('motion');

  /**
   * 작은 창 열기.
   *
   * <b>반드시 클릭 핸들러에서 이어지는 흐름에서만 성공한다</b> — 브라우저가 창을 여는 데
   * 사용자 제스처를 요구한다. 제스처 없이 부르면 'blocked' 로 돌아오는데, 그때는 조용히
   * 넘어간다(위 PIP_UNSUPPORTED_NOTICE 주석 참고).
   */
  const requestPip = useCallback(() => openPip(PIP_WINDOW_SIZE), [openPip]);

  /**
   * 음성 안내 — 자세 경고·스트레칭 알림을 목소리로도 전한다.
   *
   * 처음 값은 이 사람이 마지막으로 고른 값이다. 방 만들기에서 고른 값도 같은 자리에
   * 저장되므로, 방을 만들며 켰으면 켜진 채로 들어온다(utils/voiceGuidance 참고).
   */
  const [voiceGuidanceOn, setVoiceGuidanceOn] = useState(readVoiceGuidance);
  const { supported: speechSupported, announce } =
    useVoiceGuidance(voiceGuidanceOn);

  /**
   * 안내 문구를 만들 때 "이번 감지가 몇 번째인지"를 알아야 한다.
   *
   * 카운트를 올리는 자리(setDetectCounts)의 갱신 함수 안에서는 말을 걸 수 없다 —
   * 그 함수는 순수해야 하고 React 가 두 번 부를 수도 있다. 직전 값을 여기에 비춰 두고
   * 효과 쪽에서 +1 해서 쓴다.
   */
  const detectCountsRef = useRef(detectCounts);
  useEffect(() => {
    detectCountsRef.current = detectCounts;
  }, [detectCounts]);

  // 서버 자세 판정 — 1초에 한 번 피처를 보내고 지속이 확정된 자세를 돌려받는다.
  //
  // 스트레칭 중에는 반드시 멈춘다:
  //   1) 스트레칭 동작(목 기울이기 등)이 서버에는 나쁜 자세로 보여 카운트가 오염된다
  //   2) 스트레칭 판정 루프와 랜드마커 추론을 이중으로 돌리게 된다 (usePoseStream 주석 참고)
  // 턱 괴기는 브라우저에서 판정한다. 손목·팔꿈치가 서버 계약(v1)에 없기 때문이다.
  // 자기 랜드마커 루프를 돌리지 않고 아래 usePostureFrames 의 추론 결과를 받아 쓴다.
  const chinRest = useChinRestDetection({
    sessionId: studyRecordId,
    onConfirmed: useCallback(() => {
      updateDetectCounts((prev) => ({ ...prev, BACK: prev.BACK + 1 }));
    }, [updateDetectCounts]),
  });

  /**
   * 랜드마크를 나눠 쓰는 곳들. 랜드마커는 싱글턴이라 루프를 더 만들 수 없어서
   * (usePoseStream 주석 참고) 이 한 자리에 모아 넘긴다.
   *
   * 배경 효과는 "여러 사람이 잡혔을 때 어느 덩어리가 나인지" 고르는 데만 쓴다.
   * 이 훅은 스트레칭 중·카메라 꺼짐에는 멈추는데, 그때 배경 효과는 가장 큰 덩어리를
   * 나로 보는 방식으로 알아서 넘어간다.
   */
  const chinRestLandmarks = chinRest.onFrame;
  const handleLandmarks = useCallback<PoseFrameHandler>(
    (landmarks, width, height) => {
      chinRestLandmarks(landmarks, width, height);
      bgEffectLandmarks(landmarks, width, height);
    },
    [chinRestLandmarks, bgEffectLandmarks],
  );

  const postureFrames = usePostureFrames({
    videoRef,
    sessionId: studyRecordId,
    // 쉬는 시간에도 멈춘다. 그동안은 순공 시간이 흐르지 않는데 판정만 계속 돌면,
    // 공부하지 않은 시간에 잡힌 나쁜 자세가 공부한 시간에서 깎이게 된다.
    enabled: cameraOn && !detectionOff,
    // 프로덕션 빌드에서는 DevControls 가 렌더되지 않아 항상 null 이고, 서버 기본값으로 판정된다.
    detector: dev.detector,
    onLandmarks: handleLandmarks,
  });

  /**
   * 화면에 쓸 자세 목록.
   *
   * 아는 종류만 통과시킨다. 프론트가 먼저 배포되고 백엔드가 아직 옛 버전이면 이제는 판정하지
   * 않는 종류(라운드숄더)가 계속 내려오는데, 그걸 그리면 이름표 없는 신호등이 하나 뜬다.
   */
  const visiblePostures = useMemo(
    () => postureFrames.active.filter((t) => POSTURE_TYPES.includes(t)),
    [postureFrames.active],
  );

  // 경고 표시는 서버가 아직 해소하지 않은 자세만 따른다. 누적 카운트로 표시하면
  // 자세를 바로잡아도 코칭 화면이 영영 꺼지지 않는다.
  const warningCheckIds = useMemo(
    // useMemo는 값이 바뀌지 않으면 계속 같은 배열을 반환하므로, useEffect 의존성으로 쓰기 좋다
    () => {
      const ids = visiblePostures
        .map((type) => POSTURE_TYPE_TO_CHECK[type])
        .filter(Boolean);
      // 턱 괴기는 서버 판정이 아니라 로컬 판정이라 따로 얹는다
      if (chinRest.active) ids.push('back');
      return ids;
    },
    [visiblePostures, chinRest.active],
  );

  // 컨트롤바 표시용 — 서버 판정 종류를 부위로 옮긴다
  const activeParts = useMemo(() => {
    const parts = visiblePostures
      .map((type) => POSTURE_TYPE_TO_PART[type])
      .filter(Boolean);
    if (chinRest.active) parts.push('BACK');
    return parts;
  }, [visiblePostures, chinRest.active]);

  /**
   * 지금 떠 있는 경고가 모두 풀려 코칭 화면이 닫힐 것으로 보이는 시각. 회복 중이 아니면 null.
   *
   * <p>
   * 경고가 두 갈래로 들어와서 한쪽만 봐서는 맞출 수 없다. 서버 자세 3종은 바른 자세 응답
   * 2회로 풀리고, 턱 괴기는 브라우저가 손이 떨어진 지 1초로 푼다. 화면은 <b>둘 다</b> 풀려야
   * 닫히므로 늦게 끝나는 쪽에 맞춘다.
   *
   * <p>
   * 하나라도 아직 회복을 시작하지 않았으면(=다시 흐트러졌으면) null 이다 — 남은 시간을
   * 보여줄 수 있는 상태가 아니다.
   */
  const recoveryEndsAt = useMemo(() => {
    const ends: number[] = [];
    if (visiblePostures.length > 0) {
      if (postureFrames.recoveryEndsAt === null) return null;
      ends.push(postureFrames.recoveryEndsAt);
    }
    if (chinRest.active) {
      if (chinRest.releasingSince === null) return null;
      ends.push(chinRest.releasingSince + CHIN_REST_RELEASE_SECONDS * 1000);
    }
    return ends.length > 0 ? Math.max(...ends) : null;
  }, [
    visiblePostures,
    postureFrames.recoveryEndsAt,
    chinRest.active,
    chinRest.releasingSince,
  ]);

  /**
   * 아직 고치지 않은 사람에게 보여줄 회복 조건 안내.
   *
   * 해제 조건이 경고마다 달라서 문구도 따라가야 한다 — 서버 자세는 바른 자세 2초, 턱 괴기는
   * 손을 떼고 1초다. 한 문구로 뭉뚱그리면 둘 중 하나는 늘 틀린 말이 되고, 시킨 대로 했는데
   * 화면이 안 닫히는 것처럼 보인다.
   *
   * null 이면 자세 경고가 아닌 코칭(카메라 꺼짐 등)이라 그 모드의 기본 문구를 쓴다.
   */
  const recoveryHint = useMemo(() => {
    const posture = visiblePostures.length > 0;
    const tail = '유지하면 자동으로 이전 스터디룸 화면으로 돌아갑니다.';

    // 자세를 고치긴 했는데 해제 기준에 못 미치는 구간. 이 말을 안 해주면 시킨 대로
    // 2초를 유지해도 안 바뀌는 이유를 알 길이 없다 — 이 화면에서 가장 헷갈리던 자리다.
    if (posture && postureFrames.recovery?.phase === 'almost') {
      return '조금만 더 — 자세가 나아졌지만 아직 해제 기준에 못 미쳐요. 등을 펴고 화면과 거리를 더 두어 보세요.';
    }
    // 몸이 가려지거나 틀어져 서버가 판정을 못 하는 동안은 시간도 가지 않는다.
    if (posture && postureFrames.recovery?.phase === 'paused') {
      return '자세를 확인하지 못하고 있어요. 어깨와 얼굴이 화면에 모두 보이도록 앉아주세요.';
    }

    if (posture && chinRest.active) {
      return `손을 턱에서 떼고 바른 자세를 ${POSTURE_RECOVERY_SECONDS}초간 ${tail}`;
    }
    if (chinRest.active) {
      return `손을 턱에서 떼고 ${CHIN_REST_RELEASE_SECONDS}초간 ${tail}`;
    }
    if (posture) {
      return `바른 자세를 ${POSTURE_RECOVERY_SECONDS}초간 ${tail}`;
    }
    return null;
  }, [visiblePostures, chinRest.active, postureFrames.recovery]);

  const coaching = useCoaching(cameraOn, dev.coachMode, warningCheckIds);
  const highlights = usePostureHighlights(
    cameraOn,
    dev.severity ?? (warningCheckIds.length > 0 ? 'moderate' : null),
  );

  // 경고가 있으면 로컬 화면만 코칭 모드로 전환된다
  const coachingActive = !stretchingOpen && coaching.warningIds.length > 0;

  /**
   * 다른 참여자 타일에 보여줄 내 상태.
   *
   * 스트레칭이 경고보다 앞선다 — 스트레칭은 경고가 5회 쌓여야 열리므로 둘이 겹칠 때
   * 나중 단계인 스트레칭을 보여주는 것이 맞다(coachingActive 자체가 이미 스트레칭 중에는
   * 꺼지지만, 읽는 사람이 순서를 확인하지 않아도 되도록 여기서도 분명히 해 둔다).
   */
  const myCoachingState: CoachingState = stretchingOpen
    ? 'stretching'
    : coachingActive
      ? 'warning'
      : 'none';

  // 자세 경고·스트레칭을 방에 알린다. 이 값이 없으면 상대 화면에서는 아무 일도 없는 것처럼
  // 보인다 — 판정이 각자 브라우저에서만 돌기 때문이다. 같은 값을 반복해서 보내지 않는 것은
  // sendCoachingState 안에서 막는다.
  useEffect(() => {
    sendCoachingState(myCoachingState);
  }, [myCoachingState, sendCoachingState]);

  // 인물 세그멘테이션(usePersonMask)은 더 이상 돌리지 않는다. 몸 위에 부위별로 색을
  // 칠하는 레이어에만 쓰이던 값인데 그 레이어를 걷어냈다(CoachingStage 참고).
  // 경고가 뜰 때마다 GPU 로 매 프레임 사람을 오려내던 작업이 통째로 사라진다.

  const handleStretchingReturn = useCallback(() => {
    // 결과 화면에 보여줄 수행 횟수. 실제로 마친 것만 센다 — 건너뛰고 돌아온 건은 올리지 않는다.
    // (서버 기록도 같은 규칙이다: 시도는 남고 완료만 안 올라간다 — useStretching 참고)
    if (stretchingPhaseRef.current === 'complete') {
      countStretchingDone();
    }
    // 다음에 열릴 때 다시 고르게 한다
    setPickedStretching(null);
    // 다음 차례로 넘긴다. 여는 시점이 아니라 여기서 올려야 지금 하던 동작이 도중에 바뀌지 않는다.
    // 건너뛰고 돌아온 경우에도 넘긴다 — 같은 동작이 안 된다고 계속 나오면 그대로 막힌다.
    advanceStretch();
    // 결과 기록은 useStretching 이 보낸다(열릴 때 start, 끝날 때 complete/skip).
    // 스트레칭을 실제로 한 부위(임계치에 먼저 도달한 부위)만 0으로 되돌린다.
    // 다른 부위가 동시에 임계치를 넘었더라도 그 부위는 스트레칭을 안 했으므로
    // 면제하면 안 된다. 다만 그대로 두면 오버레이가 닫히지 않고 이어지는데,
    // 화면 상태(뽑힌 동작·진행 단계)가 연속 세션을 지원하지 않으므로
    // 임계치 직전 값으로 낮춰 일단 닫고, 다음 감지 1회로 다시 열리게 한다.
    updateDetectCounts((prev) => {
      const target = DETECT_PARTS.find((p) => prev[p] >= MAX_WARNING_COUNT);
      if (!target) return prev;
      const next = { ...prev, [target]: 0 };
      DETECT_PARTS.forEach((p) => {
        if (p !== target && next[p] >= MAX_WARNING_COUNT) {
          next[p] = MAX_WARNING_COUNT - 1;
        }
      });
      return next;
    });

    // 강제로 닫았던 작은 창을 되돌린다 — 단, 미션을 실제로 마친 경우에만.
    // 패스(패널티)로 빠져나온 경우는 수행한 것이 아니므로 사용자가 직접 다시 켜야 한다.
    //
    // 이 함수는 '스트레칭 완료 - 스터디로 돌아가기' 버튼 클릭에서 그대로 이어진다.
    // 창을 여는 데 필요한 사용자 제스처가 그 클릭이다 — 여기 말고 다른 자리에서 부르면
    // 브라우저가 거부한다.
    // 완료 안내는 여기서 하지 않는다. 이 함수는 사용자가 버튼을 누른 뒤라 이미 화면을
    // 보고 있다 — 정작 필요한 건 동작을 마친 그 순간이라서, 단계 변화 쪽에서 읽는다.
    if (pipWasOpenRef.current && stretchingPhaseRef.current === 'complete') {
      void requestPip();
    }
    pipWasOpenRef.current = false;
  }, [requestPip, countStretchingDone, updateDetectCounts, advanceStretch]);

  // 졸음 감지 동의 여부를 읽는다 (입장 시 1회).
  // 실패하면 false 로 둔다 — 동의를 확인하지 못한 상태에서 눈을 보는 감지를 켜면 안 된다.
  useEffect(() => {
    let alive = true;
    getMyOnboarding()
      .then((me) => {
        if (!alive) return;
        setDrowsinessConsent(me.drowsinessDetectionConsent);
        setCaptureConsent(me.postureCaptureConsent);
      })
      .catch((e) => {
        console.warn('[졸음] 동의 여부를 확인하지 못해 감지를 끕니다', e);
        if (!alive) return;
        setDrowsinessConsent(false);
        setCaptureConsent(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  // 개인 기준선을 불러온다 (입장 시 1회). 없으면 스트레칭 판정이 시작 자세를 기준으로 돈다.
  useEffect(() => {
    if (memberId === null) return;
    let alive = true;
    getCalibration()
      .then((c) => {
        if (alive) setBaseline(c.baseline);
      })
      .catch((e) => {
        console.warn('[calibration] 기준 자세를 불러오지 못했습니다', e);
      });
    return () => {
      alive = false;
    };
  }, [memberId]);

  // 이 방의 기존 누적 시간을 읽어 둔다 (입장 시 1회).
  // 실패하면 0 으로 두는데, 그러면 재입장 시 지난 시간이 지워질 수 있다. 첫 입장이면 어차피 0 이다.
  useEffect(() => {
    if (studyRecordId === null) return;
    let alive = true;
    getStudyRecord(studyRecordId)
      .then((d) => {
        if (!alive) return;
        setPriorFocusedSeconds(d.focusedSeconds);
        setPriorAwaySeconds(d.awaySeconds);
        setPriorBreakSeconds(d.breakSeconds);
        setPriorTotalSeconds(d.totalStudySeconds);
      })
      .catch((e) => {
        console.warn(
          '[end] 기존 누적 시간을 불러오지 못했습니다 (0 으로 시작)',
          e,
        );
        // 실패해도 계속 '-' 로 두면 시간이 멈춘 것처럼 보인다. 0 으로 두고 이번 세션만 센다.
        if (alive) setPriorFocusedSeconds(0);
      });
    return () => {
      alive = false;
    };
  }, [studyRecordId]);

  // 등록된 스트레칭 가이드를 미리 받아둔다 (방에 들어올 때 1회)
  useEffect(() => {
    let alive = true;
    getStretchings()
      .then((list) => {
        if (alive) setStretchings(list);
      })
      .catch((e) => {
        // 실패해도 기본 루틴으로 동작하므로 진행을 막지 않는다
        console.warn('[stretching] 가이드 목록을 불러오지 못했습니다', e);
      });
    return () => {
      alive = false;
    };
  }, []);

  /**
   * 이번 스트레칭에서 할 동작. 사용자가 고르기 전까지는 null 이고, 그동안 오버레이는
   * 동작 선택 화면을 보여준다.
   *
   * 오버레이가 닫혀 있을 때 값이 남아 있으면 다음 번에 지난 동작이 그대로 뜬다.
   * 효과에서 비우면 렌더가 한 번 더 도니까, 열려 있을 때만 인정하는 식으로 파생시킨다.
   */
  /**
   * 턱 괴기로 열린 스트레칭은 고르게 하지 않고 목·어깨 동작 중 하나를 임의로 정한다.
   *
   * 부위별로 무작위 한 동작을 시킨다 — 세 부위 모두 고르는 화면 없이 바로 시작한다.
   *
   *   거북목(NECK) 5회      → 목 동작 중 하나
   *   어깨 높낮이(SHOULDER) → 어깨 동작 중 하나
   *   턱 괴기(BACK)         → 목·어깨 동작 중 하나 (BACK 부위 동작이 등록돼 있지 않다)
   *
   * 고르게 하지 않는 이유: 손을 내리고 몸을 풀게 하는 것이 목적이라 어느 동작이든 하나만
   * 시키면 되고, 고르는 화면에 머무는 동안 나쁜 자세가 이어질 수 있다.
   *
   * 동작은 STRETCH_ORDER 순서로 돈다. stretchTurn 은 스트레칭이 한 번 닫힐 때마다 오르므로,
   * 같은 부위로 연달아 걸려도 매번 다음 동작이 나온다. 세션이 바뀌면 0 으로 돌아간다.
   */
  const autoStretching = useMemo(() => {
    if (stretchTarget === null) return null;
    const pool = stretchings.filter((s) =>
      stretchTarget === 'BACK'
        ? s.targetPart === 'NECK' || s.targetPart === 'SHOULDER'
        : s.targetPart === stretchTarget,
    );
    // 그 부위 동작이 등록돼 있지 않으면 고르는 화면으로 넘긴다(전체 목록이 나온다).
    if (pool.length === 0) return null;
    const ordered = [...pool].sort(
      (a, b) => stretchRank(a) - stretchRank(b) || a.sortOrder - b.sortOrder,
    );
    return ordered[stretchTurn % ordered.length];
  }, [stretchings, stretchTarget, stretchTurn]);

  // 임의로 정해진 동작이 있으면 선택 화면 없이 바로 그 동작으로 들어간다.
  const activeStretching = stretchingOpen
    ? (pickedStretching ?? autoStretching)
    : null;

  /** 고를 수 있는 동작. 감지된 부위 것이 있으면 그것만, 없으면 등록된 전체를 보여준다. */
  const stretchChoices = useMemo(() => {
    const matched = stretchings.filter((s) => s.targetPart === stretchTarget);
    return matched.length > 0 ? matched : stretchings;
  }, [stretchings, stretchTarget]);

  // 고른 동작 하나가 이번 스트레칭의 단계가 된다
  const stretchSteps = useMemo(
    () => (activeStretching ? [toStep(activeStretching)] : STRETCHING_STEPS),
    [activeStretching],
  );

  // 재도전할 때마다 판정기를 새로 만들기 위한 키
  const [attemptKey, setAttemptKey] = useState(0);

  // 웹캠에서 실제 스트레칭 동작을 판정한다
  // 동작을 고르기 전에는 판정기를 돌리지 않는다. 무엇을 판정할지가 정해지지 않았다.
  const detection = useStretchDetection({
    videoRef,
    active: activeStretching !== null,
    stretchingName: activeStretching?.name ?? null,
    holdSeconds: activeStretching?.holdSeconds ?? 5,
    personalBaseline: baseline,
    attemptKey,
  });

  const stretching = useStretching({
    // 고르기 전에는 진행을 시작하지 않는다. 안 그러면 선택 화면을 보는 동안
    // 90초 제한 시간이 흐르고 시도 횟수가 깎인다.
    open: activeStretching !== null,
    onReturn: handleStretchingReturn,
    // 결과를 서버에 남긴다 — 시도는 열릴 때, 완료/건너뛰기는 끝날 때.
    sessionId: studyRecordId,
    stretchingId: activeStretching?.stretchingId ?? null,
    steps: stretchSteps,
    baseline,
    // 판정기가 없는 동작이면 null → 대체 타이머로 진행한다
    detectedProgress: detection.supported ? detection.progressPercent : null,
  });

  // 스트레칭을 끝낸 방식(완료 / 패스)에 따라 작은 창을 되돌릴지가 갈린다.
  // handleStretchingReturn 은 stretching 보다 먼저 만들어져야 해서 ref 로 건넨다.
  useEffect(() => {
    stretchingPhaseRef.current = stretching.state.phase;
  }, [stretching.state.phase]);

  /**
   * 스트레칭 단계가 바뀔 때마다 읽어 준다 — 이 화면에서 음성이 가장 필요한 자리다.
   *
   * <p>
   * 동작을 따라 하는 동안에는 화면을 못 보고 있는 경우가 많다. 목을 옆으로 기울이거나
   * 어깨를 돌리는 자세라 화면이 시야에서 벗어난다. 완료·실패·패널티가 조용히 지나가면
   * 언제 끝났는지 몰라 계속 동작만 하고 있게 된다.
   *
   * <p>
   * 모두 force 다 — 방 경고를 끊고서라도 들려야 한다. 어차피 스트레칭 중에는 다른 안내를
   * 내보내지 않으므로 실제로 끊을 일은 넘어오는 순간뿐이다.
   */
  const stretchPhase = stretching.state.phase;
  const stretchAttemptsLeft =
    stretching.state.maxAttempts - stretching.state.attemptsUsed;
  /** 같은 단계를 두 번 읽지 않기 위한 표시. 진행률은 매 프레임 바뀌므로 단계만 본다 */
  const announcedPhaseRef = useRef<StretchingPhase | null>(null);

  useEffect(() => {
    // 동작을 고르기 전에는 진행 단계가 없다(useStretching 이 아직 안 열렸다).
    if (!activeStretching) {
      // 다음 스트레칭에서 처음부터 다시 읽도록 비운다
      announcedPhaseRef.current = null;
      return;
    }
    // 막 고른 시점에는 지난 스트레칭의 단계가 아직 남아 있을 수 있다 — useStretching 이
    // 다음 렌더에서 'motion' 으로 되돌린다. 첫 관찰은 읽지 않고 기준점으로만 삼는다.
    // 이게 없으면 지난번을 패스로 끝낸 사람이 선택하자마자 패널티 안내를 다시 듣는다.
    if (announcedPhaseRef.current === null) {
      announcedPhaseRef.current = stretchPhase;
      return;
    }
    if (announcedPhaseRef.current === stretchPhase) return;
    announcedPhaseRef.current = stretchPhase;

    // 'motion' 은 동작을 고를 때 이미 읽었으므로 건너뛴다.
    // 재도전으로 'motion' 에 돌아오는 경우도 사용자가 버튼을 누른 직후라 화면을 보고 있다.
    if (stretchPhase === 'complete') {
      announce(
        'stretching-complete',
        '스트레칭을 완료했습니다. 화면의 버튼을 눌러 스터디로 돌아가세요.',
        { force: true },
      );
      return;
    }
    if (stretchPhase === 'failed') {
      announce(
        'stretching-failed',
        stretchAttemptsLeft > 0
          ? `제한 시간 안에 동작이 인식되지 않았습니다. 남은 기회 ${stretchAttemptsLeft}회입니다. 다시 도전하거나 패스를 선택해주세요.`
          : '제한 시간 안에 동작이 인식되지 않았습니다. 남은 기회가 없습니다. 패스를 선택해주세요.',
        { force: true },
      );
      return;
    }
    if (stretchPhase === 'penalty') {
      // 감점을 알리지 않는다 — 깎는 코드가 없다(StretchingOverlay 의 패널티 안내 주석 참고).
      announce(
        'stretching-penalty',
        '스트레칭을 건너뛰었습니다. 수행하지 않음으로 기록됩니다. 잠시 후 스터디룸으로 돌아갑니다.',
        { force: true },
      );
    }
  }, [activeStretching, stretchPhase, stretchAttemptsLeft, announce]);

  /**
   * 고른 동작이 무엇이고 어떻게 하는지 읽어 준다.
   *
   * 이 화면에서 음성이 가장 필요한 자리다 — 목을 옆으로 기울이거나 어깨를 돌리는 동안에는
   * 화면이 시야에서 벗어나서, 가이드 문구를 눈으로 읽을 수가 없다.
   */
  useEffect(() => {
    if (!activeStretching) return;
    announce(
      'stretching-move',
      `${activeStretching.name}. ${activeStretching.guideText}`,
      { force: true },
    );
  }, [activeStretching, announce]);

  const handleStretchingRetry = useCallback(() => {
    setAttemptKey((k) => k + 1);
    stretching.retry();
  }, [stretching]);

  // 휴대폰 감지 — 감지되면 상단에 경고 배너를 띄운다.
  //
  // 스트레칭 중에는 멈춘다. 그 화면에서는 배너를 띄우지도 않는데(아래 JSX) 감지만 계속
  // 돌고 있었다. 팔을 올리는 동작이 휴대폰으로 잘못 잡히기도 하고, 스트레칭 동작 판정과
  // GPU 를 나눠 쓰게 되어 정작 판정해야 할 쪽이 느려진다. 졸음 감지도 같은 이유로 멈춘다.
  const phone = usePhoneDetection(
    videoRef,
    cameraOn && !detectionOff,
    studyRecordId,
  );

  /** 이번 구간에 남은 초. 아직 못 셌으면 null. */
  const [phaseRemaining, setPhaseRemaining] = useState<number | null>(null);

  /**
   * 남은 시간을 직접 센다.
   *
   * 서버가 주는 remainingSeconds 는 브로드캐스트를 보낸 순간의 값이라 그대로 두면 멈춰 있다.
   * 받은 시각을 기준으로 잡고 흐른 만큼 빼서 화면에 쓴다. 페이즈가 바뀌면 새 브로드캐스트가
   * 오고 이 효과도 다시 걸리므로 기준점이 자연히 갱신된다.
   *
   * 계산을 렌더가 아니라 콜백에서 하는 이유는, 렌더 중에 Date.now() 를 부르면 같은 입력에
   * 다른 결과가 나와 React 가 기대하는 순수 렌더가 깨지기 때문이다.
   * 250ms 마다 도는 것은 페이즈가 막 바뀐 순간에도 화면이 곧바로 따라붙게 하려는 것이다.
   */
  useEffect(() => {
    if (!timerState.running || timerState.remainingSeconds === null) return;

    const startedAt = Date.now();
    const startedWith = timerState.remainingSeconds;
    const update = () => {
      const gone = Math.floor((Date.now() - startedAt) / 1000);
      setPhaseRemaining(Math.max(0, startedWith - gone));
    };

    const id = setInterval(update, 250);
    return () => clearInterval(id);
  }, [timerState]);

  /**
   * 졸음 감지 — 감지되면 배너만 띄운다(스트레칭은 자세 경고에서만 띄운다).
   *
   * 스트레칭 중에는 멈춘다: 목을 옆으로 기울이는 동작이 눈 6점의 기하를 바꿔
   * EAR 을 왜곡하고, 그러면 스트레칭할 때마다 졸음으로 잡힌다.
   */
  const drowsiness = useDrowsinessDetection(
    videoRef,
    cameraOn && !detectionOff && drowsinessConsent === true,
    studyRecordId,
  );

  /**
   * 스트레칭이 시작되면 작은 창을 '스트레칭 하러 가기' 호출 판으로 바꾼다.
   *
   * 예전에는 여기서 작은 창을 그냥 닫았다. 스트레칭은 확대된 화면이 필요한 미션이라
   * 작은 창에 남겨 두면 안 되는 건 맞는데, 큰 창을 최소화해 둔 사람에게는 그 순간 화면에서
   * 아무것도 사라져 버려서 스트레칭이 시작된 줄도 몰랐다. 브라우저는 사용자가 누르지 않은
   * 창을 스스로 띄우지 못하게 막으므로 자동으로 큰 창을 올릴 방법도 없다.
   *
   * 그래서 창은 열어 두고 내용만 갈아 끼운다 — 영상 대신 버튼 하나(StretchingCallPanel).
   * 그 버튼을 누르는 클릭이 곧 큰 창을 띄울 수 있는 사용자 제스처가 된다.
   *
   * 전환되는 순간에만 기록해야 한다 — 닫고 나면 pipOpen 이 false 가 되므로,
   * 매번 기록하면 "원래 켜져 있었다"는 사실이 바로 지워진다.
   */
  const stretchingWasOpenRef = useRef(false);
  useEffect(() => {
    if (stretchingOpen && !stretchingWasOpenRef.current) {
      pipWasOpenRef.current = pipOpen;

      // 스트레칭은 화면을 봐야 따라 할 수 있다. 다른 창을 보던 사람에게는 이 안내가
      // 유일한 신호라 쿨다운을 무시하고 반드시 읽는다.
      const label = stretchTarget ? DETECT_PART_LABEL[stretchTarget] : '자세';
      announce(
        'stretching-start',
        // 넘어오자마자 하는 일은 동작을 고르는 것이다 — 바로 따라 하라고 하면 안 된다.
        // 고르고 나면 아래 'stretching-move' 가 무엇을 할지 읽어 준다.
        `${label} 경고가 ${MAX_WARNING_COUNT}회 누적되었습니다. 스트레칭을 시작합니다. 화면에서 동작을 선택해주세요.`,
        { force: true },
      );
    }
    stretchingWasOpenRef.current = stretchingOpen;
  }, [stretchingOpen, pipOpen, stretchTarget, announce]);

  /**
   * 작은 창에서 큰 창으로 돌아간다 — '돌아가기'와 '스트레칭 하러 가기'가 함께 쓴다.
   *
   * 작은 창을 닫는 것만으로는 부족하다. 큰 창을 최소화해 둔 사람은 화면에서 아무것도
   * 남지 않은 채로 끝난다. 그래서 닫으면서 큰 창을 앞으로 끌어온다.
   *
   * focus() 는 사용자 제스처 안에서만 통하는데, 이 함수는 버튼 클릭에서 그대로 이어지므로
   * 허용된다(최소화된 창도 이 경로로는 복원된다). 반대로 제스처 없이 — 예를 들어 스트레칭이
   * 자동으로 시작되는 순간에 — 부르면 브라우저가 무시한다. 그래서 그쪽은 누를 것을 남기는
   * 방식으로 풀었다(StretchingCallPanel 참고).
   */
  const handleReturnToRoomWindow = useCallback(() => {
    closePip();
    window.focus();
  }, [closePip]);

  /**
   * 자세 경고를 되풀이해 읽는다 — 아직 해소되지 않은 경고가 대상이다.
   *
   * <p>
   * 확정되는 순간에만 읽으면 거북목처럼 한번 잡히면 계속 유지되는 자세에서 문제가 된다.
   * 화면에는 경고가 떠 있는데 소리는 처음 한 번뿐이라, 다른 창을 보던 사람은 그 한 번을
   * 놓치면 5회를 다 채울 때까지 아무것도 못 듣는다. 졸음·휴대폰은 감지가 붙었다 떨어지기를
   * 반복해 저절로 다시 읽히는데, 자세만 그렇지 않았다.
   *
   * <p>
   * 자세를 고치면 2초 만에 activeParts 에서 빠지고(서버 app.posture.recovery-seconds)
   * 이 효과도 같이 정리된다 — 고친 사람에게 계속 말하지 않는다. 고친 뒤 다시 나빠지면
   * 서버가 창을 비운 상태라 관찰 구간을 새로 채워야 하므로, 연달아 다시 읽히지 않는다.
   */
  const activePostureKey = useMemo(
    () => DETECT_PART_ORDER.filter((p) => activeParts.includes(p)).join('-'),
    [activeParts],
  );

  useEffect(() => {
    // 스트레칭 중에는 이 안내를 내보내지 않는다. 그 화면에서는 스트레칭 안내만 들려야
    // 사용자가 지금 무엇을 하라는 건지 헷갈리지 않는다. 자세 판정은 이미 멈춰 있지만
    // active 는 멈추기 직전 값 그대로 남아 있어서(usePostureFrames 정리 함수 참고),
    // 막지 않으면 미션 내내 20초마다 "거북목 경고입니다" 가 끼어든다.
    if (stretchingOpen || activePostureKey === '') return;
    const parts = activePostureKey.split('-') as TargetPart[];

    const speakWarning = () => {
      if (parts.length === 1) {
        const part = parts[0];
        const tail =
          MAX_WARNING_COUNT - detectCountsRef.current[part] === 1
            ? ' 한 번 더 감지되면 스트레칭이 시작됩니다.'
            : '';
        announce(
          // key 에 부위를 넣지 않는다. 경고 조합이 바뀔 때마다(거북목 → 거북목+어깨)
          // 다른 key 가 되어 쿨다운을 그냥 통과하고, 두 문장이 연달아 나가며 서로를 끊는다.
          'posture',
          `${DETECT_PART_LABEL[part]} 경고입니다. ${DETECT_PART_ADVICE[part]}${tail}`,
          { cooldownMs: POSTURE_REMINDER_MS },
        );
        return;
      }
      // 여럿이면 한 문장으로 합친다. 나눠 읽으면 서로를 끊어서 마지막 것만 들린다.
      announce(
        'posture',
        `${parts.map((p) => DETECT_PART_LABEL[p]).join(', ')} 경고입니다. 허리를 펴고 화면과 거리를 두어 바르게 앉아주세요.`,
        { cooldownMs: POSTURE_REMINDER_MS },
      );
    };

    speakWarning();
    const id = setInterval(speakWarning, POSTURE_REMINDER_MS);
    return () => clearInterval(id);
  }, [stretchingOpen, activePostureKey, announce]);

  // 졸음·휴대폰은 감지가 붙었다 떨어지기를 반복한다. 반복해서 읽지 않도록
  // useVoiceGuidance 의 기본 쿨다운(30초)에 맡긴다.
  //
  // 스트레칭 중에는 위 자세 경고와 같은 이유로 내보내지 않는다. 두 감지 모두 그때는
  // 꺼져 있지만, 꺼지기 직전 값이 true 로 남아 있으면 이 효과가 한 번 더 돈다.
  useEffect(() => {
    if (stretchingOpen || !drowsiness.drowsy) return;
    announce(
      'drowsy',
      '졸음이 감지되었습니다. 잠시 스트레칭하거나 휴식을 취해보세요.',
    );
  }, [stretchingOpen, drowsiness.drowsy, announce]);

  useEffect(() => {
    if (stretchingOpen || !phone.phoneVisible) return;
    announce(
      'phone',
      '휴대폰이 감지되었습니다. 시야 밖에 두고 학습에 집중해주세요.',
    );
  }, [stretchingOpen, phone.phoneVisible, announce]);

  /**
   * 창을 벗어나면 작은 창으로, 돌아오면 큰 화면으로.
   *
   * 닫는 쪽은 항상 동작한다. 여는 쪽은 브라우저가 사용자 제스처를 요구해서 거부될 수 있는데,
   * 그때는 안내만 남기고 넘어간다 — 컨트롤바의 "작은 창" 버튼이 확실한 경로다.
   *
   * 스트레칭 중에는 열지 않는다. 미션을 큰 화면에서 마쳐야 하기 때문이다.
   */
  useEffect(() => {
    if (!pip.supported) return;

    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') {
        if (stretchingOpen || pipOpen) return;
        void requestPip();
      } else if (pipOpen) {
        closePip();
      }
    };

    document.addEventListener('visibilitychange', handleVisibility);
    return () =>
      document.removeEventListener('visibilitychange', handleVisibility);
  }, [pip.supported, stretchingOpen, pipOpen, requestPip, closePip]);

  /**
   * 작은 창에 띄울 경고 한 건. 정상이면 null.
   *
   * 자세 경고를 가장 앞에 둔다 — 5회가 되면 스트레칭으로 이어지는 유일한 경고라
   * 휴대폰·졸음에 밀려 안 보이면 안 된다. 큰 화면도 같은 순서다(코칭 화면이 뜨면
   * 휴대폰·졸음 배너를 숨긴다).
   *
   * 5회에 닿는 순간 스트레칭이 열리고 작은 창은 닫히므로, 여기 뜨는 자세 경고는
   * 언제나 5회 미만이다.
   */
  const pipWarning = useMemo<PipWarning | null>(() => {
    // 컨트롤바와 같은 순서로 훑어 중복을 없애고 표시 순서를 맞춘다
    const parts = DETECT_PART_ORDER.filter((p) => activeParts.includes(p));
    if (parts.length > 0) {
      const worst = parts.reduce((a, b) =>
        detectCounts[a] >= detectCounts[b] ? a : b,
      );
      return {
        icon: '🪑',
        label: `${parts.map((p) => DETECT_PART_LABEL[p]).join(' · ')} 경고`,
        // 해제 기준에 못 미치는 구간에서는 부위별 안내 대신 그 사실을 말한다.
        // 이미 고친 사람에게 "턱을 당기세요" 를 반복하면 뭘 더 해야 할지 알 수 없다.
        advice:
          postureFrames.recovery?.phase === 'almost'
            ? '조금만 더 — 아직 해제 기준에 못 미쳐요.'
            : parts.length === 1
              ? DETECT_PART_ADVICE[parts[0]]
              : '허리를 펴고 화면과 거리를 두어 바르게 앉아주세요.',
        progressLabel: `${detectCounts[worst]}/${MAX_WARNING_COUNT}회`,
      };
    }
    if (phone.phoneVisible) {
      return {
        icon: '📱',
        label: '휴대폰 감지',
        advice: '휴대폰을 시야 밖에 두고 바른 자세로 다시 집중해주세요.',
      };
    }
    if (drowsiness.drowsy) {
      return {
        icon: '😴',
        label: '졸음 감지',
        advice: '허리를 펴고 바르게 앉아 잠을 깨워주세요.',
      };
    }
    return null;
  }, [
    activeParts,
    detectCounts,
    phone.phoneVisible,
    drowsiness.drowsy,
    postureFrames.recovery,
  ]);

  /** 작은 창의 부위별 카운터. 컨트롤바와 같은 값·같은 이름·같은 순서다 */
  const pipChips = useMemo<PipDetectChip[]>(
    () =>
      DETECT_PART_ORDER.map((part) => ({
        part,
        label: DETECT_PART_LABEL[part],
        count: detectCounts[part],
        active: activeParts.includes(part),
      })),
    [detectCounts, activeParts],
  );

  /**
   * "나가기" 로 종료를 이미 시도했는가.
   *
   * 창 닫힘 대비 전송(useSessionUnloadFlush)이 같은 세션을 두 번 끝내지 않도록 막는다.
   * state 가 아니라 ref 인 이유는 pagehide 리스너가 최신 값을 읽어야 하기 때문이다.
   */
  const endAttempted = useRef(false);

  // 탭을 닫는 순간 진행 중이던 졸음·휴대폰 구간까지 남긴다.
  // 확정된 건은 이미 저장돼 있으므로 여기서 챌 것은 아직 안 끝난 구간 하나씩뿐이다.
  // 시간 값은 더 이상 넘기지 않는다 — 이 훅이 end 를 부르지 않게 되면서(실시간 저장으로 전환)
  // 서버의 미응답 종료 처리가 progress 동기화 값(focused·break·away)을 그대로 쓴다.
  useSessionUnloadFlush({
    studyRecordId,
    takePendingDrowsiness: drowsiness.takePending,
    takePendingPhone: phone.takePending,
    ended: endAttempted,
  });

  /**
   * 지금 흐르는 1초를 순공에서 빼야 하는가.
   *
   * 자리비움: 사람이 AWAY_AFTER_MISSING_SECONDS 이상 안 잡힌 상태.
   * 졸음: 눈이 2초 이상 감겨 확정된 상태.
   * 휴대폰: 화면에 폰이 잡혀 있는 상태.
   *
   * 셋 다 자리비움(awaySeconds)으로 넣는다. 휴식이 아니라 <b>집중이 깨진 시간</b>이라,
   * 집중률 분모(focused + away)에 남아 점수를 깎아야 맞다. 휴식으로 넣으면 폰을 오래 볼수록
   * 집중률이 되레 올라간다.
   *
   * 나쁜 자세와 다르게 취급하는 이유: 거북목은 자세가 무너졌을 뿐 공부는 하고 있고 점수 쪽에서
   * 이미 깎인다. 폰을 보는 동안은 공부 자체를 안 하고 있다.
   *
   * 타이머가 매초 읽는 값이라 ref 로 둔다. state 를 타이머 effect 의 의존성에 넣으면
   * 자리비움·졸음이 바뀔 때마다 setInterval 이 다시 걸려 1초 위상이 초기화된다
   * (전환마다 최대 1초씩 사라진다).
   */
  const personMissing =
    postureFrames.personMissingSeconds >= AWAY_AFTER_MISSING_SECONDS;
  const idle = personMissing || drowsiness.drowsy || phone.phoneVisible;

  const idleRef = useRef(false);
  useEffect(() => {
    idleRef.current = idle;
  }, [idle]);

  /**
   * 이 순간의 자세를 신호등 한 칸으로 압축한 값. 타임랩스 막대의 색이 된다.
   *
   * 3종 중 가장 나쁜 것을 취한다. 거북목만 빨간데 전체를 초록으로 칠하면
   * 나중에 막대를 봤을 때 문제가 없었던 것처럼 보인다.
   */
  const timelapseLight: PostureLight = useMemo(() => {
    const res = postureFrames.lastResponse;
    if (!res || res.judgements.length === 0) return 'paused';
    const lights = res.judgements.map(toPostureLight);
    if (lights.includes('danger')) return 'danger';
    if (lights.includes('caution')) return 'caution';
    return lights.every((l) => l === 'paused') ? 'paused' : 'ok';
  }, [postureFrames.lastResponse]);

  /**
   * 공부 중 10초마다 웹캠을 한 장씩 담아 종료 화면에서 돌려 본다.
   *
   * 시간이 흐르는 조건(위 setInterval)과 같은 조건에 사람이 보일 때까지 더한다.
   * 자리를 비웠거나 쉬는 중일 때 찍으면 빈 의자만 잔뜩 담긴다.
   *
   * 이미지는 브라우저 밖으로 나가지 않는다 — IndexedDB 를 거쳐 종료 화면에 넘기고 거기서 끝이다.
   */
  const timelapse = useSessionTimelapse({
    videoRef,
    enabled:
      captureConsent === true &&
      cameraOn &&
      !stretchingOpen &&
      !coachingActive &&
      !timerResting &&
      !personMissing,
    light: timelapseLight,
  });

  // 시간은 카메라가 켜져 있고 공부 화면일 때만 흐른다.
  //   - 카메라를 끄면 감지가 불가능하므로 아무 시간도 세지 않는다
  //     (자리비움으로 넣지 않는다 — 몇 시간 방치하면 total 이 그만큼 부풀기 때문)
  //   - 스트레칭은 학습이 아니므로 멈춘다. 완료해야 다시 흐른다
  //     스트레칭 시간은 지금 어디에도 안 센다. breakSeconds 로 넣어야 하는데
  //     그때 집중도 점수 공식도 같이 봐야 한다(useStudyProgressSync 참고).
  //   - 방 타이머의 쉬는 시간·스트레칭 구간에도 멈춘다. 다시 집중 구간이 되면 이어서 흐른다.
  //
  // 자세가 나빠 경고·코칭이 떠 있는 동안에도 시간은 흐른다. 자세가 무너졌을 뿐 책상 앞에서
  // 공부하고 있는 것은 맞고, 나쁜 자세는 이미 점수 쪽에서 따로 깎인다(서버가 events 를 모아
  // bad_posture_seconds·good_posture_ratio 를 계산한다). 시간까지 멈추면 같은 일로 두 번
  // 손해를 본다 — 거북목으로 30분 공부한 사람의 순공이 0분이 된다.
  //
  // 쉬는 시간에는 awayElapsed 도 세지 않는다. 자리를 비운 게 아니라 방 전체가 쉬는 중이라,
  // 자리비움으로 넣으면 집중도 점수가 부당하게 깎인다.
  useEffect(() => {
    if (!cameraOn || stretchingOpen || timerResting) return;
    const id = setInterval(() => {
      if (idleRef.current) setAwayElapsed((s) => s + 1);
      else setElapsed((s) => s + 1);
    }, 1000);
    return () => clearInterval(id);
  }, [cameraOn, stretchingOpen, timerResting]);

  // 위에서 멈춰 둔 시간을 여기서 센다. 순공도 자리비움도 아니지만 흘러간 시간이므로
  // 휴식으로 남겨야 서버가 재는 시계(나쁜 자세 시간)와 아귀가 맞는다.
  useEffect(() => {
    if (!cameraOn || !(stretchingOpen || timerResting)) return;
    const id = setInterval(() => setBreakElapsed((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [cameraOn, stretchingOpen, timerResting]);

  /**
   * 총 시간. 위 순공 타이머와 달리 <b>아무 조건도 걸지 않는다</b> — 이 화면이 떠 있는
   * 동안에는 카메라를 꺼도, 쉬는 시간에도, 스트레칭 중에도 흐른다.
   *
   * 서버에 따로 보내지 않는다. 서버의 totalStudySeconds 는 집중+휴식+자리비움의 합이라
   * 정의가 다르고, 이 값은 "시계가 살아 있다"를 보여주는 표시용이다.
   */
  useEffect(() => {
    const id = setInterval(() => setTotalElapsed((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, []);

  // 창이 닫히거나 브라우저가 죽어도 공부 시간이 남도록 주기적으로 저장한다.
  // 서버는 받은 값으로 덮어쓰므로 재입장 분을 합쳐서 보낸다.
  useStudyProgressSync({
    studyRecordId,
    focusedSeconds: (priorFocusedSeconds ?? 0) + elapsed,
    breakSeconds: priorBreakSeconds + breakElapsed,
    awaySeconds: priorAwaySeconds + awayElapsed,
    onRolledOver: handleRolledOver,
  });

  /**
   * 이 방에서 지금까지 공부한 총 시간.
   *
   * elapsed 는 이번에 화면을 띄운 뒤로만 센다. 새로고침하면 0 부터 다시 시작하므로
   * 이 값만 보여주면 시간이 사라진 것처럼 보인다. 서버에 저장된 지난 시간을 더해야
   * 화면·결과·서버 저장값이 모두 같은 수를 가리킨다.
   */
  const totalFocusedSeconds = (priorFocusedSeconds ?? 0) + elapsed;

  /** 지난 시간을 아직 못 읽은 동안. 이때는 숫자 대신 '-' 를 보여준다. */
  const focusedTimeLoading =
    studyRecordId !== null && priorFocusedSeconds === null;

  /** 방장만 학습·쉬는 시간을 바꾸고 타이머를 시작·정지할 수 있다. */
  const isHost = room !== null && room.hostMemberId === memberId;

  const settingsItems = useMemo(
    () =>
      isHost
        ? [
            {
              id: 'timer-settings',
              label: '학습/쉬는 시간 변경',
              onSelect: () => setTimerDialogOpen(true),
            },
          ]
        : [],
    [isHost],
  );

  /**
   * 방에 들어오면 타이머가 알아서 돈다 — 시작 버튼을 따로 두지 않는다.
   *
   * 시작 요청은 방장만 보낼 수 있어서 방장 화면에서만 부른다.
   * 나머지 참여자는 브로드캐스트로 같은 구간을 받는다.
   *
   * 입장 직후 한 번 확인하고, 그 뒤로는 주기적으로 다시 본다. 서버가 재시작되면 진행 중이던
   * 타이머가 사라지는데(상태를 메모리에 둔다), 방장 화면이 떠 있는 채로는 아무도 되살리지
   * 못하기 때문이다. 살아 있으면 아무것도 하지 않으므로 화면에는 변화가 없다.
   *
   * 돌고 있을 때 시작을 부르면 진행 중이던 사이클이 처음으로 되돌아가서, 먼저 들어와
   * 공부하던 사람들의 구간이 어긋난다. 그래서 매번 서버 상태를 먼저 확인한다 —
   * 화면의 timerState 를 믿으면 안 된다. 입장 직후나 연결이 끊긴 동안에는
   * 아직 동기화 전이라 running 이 false 로 보일 수 있다.
   */
  useEffect(() => {
    if (!isHost || roomId === undefined) return;
    const numericRoomId = Number(roomId);
    let alive = true;

    const ensureRunning = () => {
      getRoomTimerState(numericRoomId)
        .then((state) => {
          if (!alive || state.running) return;
          return startRoomTimer(numericRoomId);
        })
        .catch((e) => {
          // 서버가 잠깐 죽었을 수도 있다. 다음 주기에 다시 시도한다.
          console.error('[timer] 자동 시작 실패', e);
        });
    };

    ensureRunning();
    const id = setInterval(ensureRunning, TIMER_HEALTH_CHECK_MS);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [isHost, roomId]);

  /**
   * 실시간 자세 신호등. 붙는 위치가 화면마다 달라서(그리드는 내 타일 안, 코칭은 스테이지)
   * 요소를 한 번 만들어 두고 필요한 쪽에 넘긴다.
   * 스트레칭 중에는 판정을 멈추므로 아예 만들지 않는다.
   */
  const postureLights = stretchingOpen ? null : (
    <PostureLights
      response={postureFrames.lastResponse}
      badSeconds={postureFrames.badSeconds}
      windowSeconds={POSTURE_WINDOW_SECONDS}
      pausedReason={describeDetectionPause()}
      chinRest={chinRest}
    />
  );

  /**
   * 작은 창(PiP) 상태 줄에 넣을 실시간 판정. 위 신호등과 같은 재료를 가로 한 줄로 압축한다.
   *
   * 신호등을 영상 위에 그대로 얹었더니 얼굴을 가렸다(사용자 피드백). 이름은 좁은 창에
   * 맞게 짧게 쓰고, 위험일 때만 "6/10초" 진행을 붙인다.
   */
  const pipLights = useMemo<PipLightItem[]>(() => {
    const res = postureFrames.lastResponse;
    const SHORT_LABEL: Partial<Record<string, string>> = {
      FORWARD_HEAD: '거북목',
      SHOULDER_TILT: '어깨',
    };
    const items: PipLightItem[] = POSTURE_TYPES.map((type) => {
      const judgement = res?.judgements.find((j) => j.type === type);
      const light = judgement ? toPostureLight(judgement) : 'paused';
      const seconds = postureFrames.badSeconds[type] ?? 0;
      return {
        key: type,
        label: SHORT_LABEL[type] ?? type,
        light,
        progressLabel:
          light === 'danger' && seconds > 0
            ? `${Math.min(seconds, POSTURE_WINDOW_SECONDS)}/${POSTURE_WINDOW_SECONDS}초`
            : null,
      };
    });
    items.push({
      key: 'CHIN_REST',
      label: '턱 괴기',
      light:
        chinRest.holding || chinRest.active
          ? 'danger'
          : chinRest.blockedReason && chinRest.blockedReason !== 'HAND_HIDDEN'
            ? 'paused'
            : 'ok',
      progressLabel: chinRest.holding
        ? `${Math.min(chinRest.holdingSeconds, CHIN_REST_HOLD_SECONDS)}/${CHIN_REST_HOLD_SECONDS}초`
        : null,
    });
    return items;
  }, [
    postureFrames.lastResponse,
    postureFrames.badSeconds,
    chinRest.holding,
    chinRest.active,
    chinRest.blockedReason,
    chinRest.holdingSeconds,
  ]);

  // 서버가 자세를 새로 확정할 때마다 해당 부위 카운트를 올린다.
  // 경고가 유지되는 동안 계속 세면 안 되므로 누적 확정 횟수의 증가분만 반영한다.
  const countedConfirmations = useRef(0);
  useEffect(() => {
    const delta = postureFrames.confirmedCount - countedConfirmations.current;
    countedConfirmations.current = postureFrames.confirmedCount;
    if (delta <= 0) return;

    const confirmed = postureFrames.lastResponse?.confirmed ?? [];
    if (confirmed.length === 0) return;

    updateDetectCounts((prev) => {
      const next = { ...prev };
      confirmed.forEach((type) => {
        const part = POSTURE_TYPE_TO_PART[type];
        if (part) next[part] += 1;
      });
      return next;
    });

    // 읽어 주는 일은 여기서 하지 않는다. 확정 순간에만 읽으면 경고가 유지되는 동안
    // 다시 들을 수 없어서, 아래 '자세 경고 되풀이' 효과가 activeParts 를 보고 맡는다.
    // lastResponse 는 confirmedCount 가 오를 때 같이 갱신된다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [postureFrames.confirmedCount]);

  // 본인 타일은 로컬 상태(카메라/마이크 토글)를 그대로 쓰고, 나머지는 서버 실시간 목록에서 가져온다.
  //
  // 계산 자체는 가볍지만 결과 배열의 참조가 매 렌더 바뀌면 VideoGrid·RoomSidebar 가 memo 를
  // 걸어도 전부 다시 그려진다. 이 페이지는 1초마다(타이머) 리렌더되므로 그 비용이 계속 든다.
  // 조기 반환보다 위에 두어야 훅 순서가 깨지지 않는다.
  const participants: Participant[] = useMemo(
    () => [
      {
        id: 'me',
        name: userName,
        // 내 사진은 서버 목록이 아니라 로그인 정보에서 가져온다. 이 타일은 서버 목록을 쓰지
        // 않고 로컬 상태로 그리기 때문이다(카메라·마이크 토글이 즉시 반영돼야 한다).
        profileImageUrl: myProfileImage,
        isSelf: true,
        cameraOn,
        micOn,
        // 내 타일은 서버 목록을 안 쓰므로 공유 상태도 여기서 직접 넣어 준다.
        screenSharing: screenShare.sharing,
        // 코칭 상태도 마찬가지다. 방에 보낸 값이 되돌아오기를 기다리지 않고 바로 반영해야,
        // 내 화면에서 테두리가 상대보다 한 박자 늦게 바뀌는 일이 없다.
        coachingState: myCoachingState,
      },
      ...roomParticipants.filter((p) => !p.isSelf),
    ],
    [
      userName,
      myProfileImage,
      cameraOn,
      micOn,
      screenShare.sharing,
      myCoachingState,
      roomParticipants,
    ],
  );

  // 나가기 처리 중에는 clearEntry() 로 입장 상태가 비워지는데, 그때 이 가드가 걸리면
  // 결과 화면 대신 준비 화면으로 되돌아가 버린다. 나가는 중에는 건너뛴다.
  if (verifiedRoomId !== roomId && !leaving) {
    return <Navigate to={`/study/room/${roomId}/preparation`} replace />;
  }

  function handleToggleVoiceGuidance() {
    const next = !voiceGuidanceOn;
    setVoiceGuidanceOn(next);
    // 다음 입장에도 이어지도록 남긴다. 켤 때마다 다시 끄게 하면 기능이 성가셔진다.
    writeVoiceGuidance(next);
  }

  function handleChangeBackgroundEffect(next: BackgroundEffect) {
    setBackgroundEffect(next);
    // 다음 입장에도 이어지도록 남긴다. 배경을 가리는 이유(뒤에 사람이 지나다닌다 같은)는
    // 대개 한 번 켜면 계속 유지되는 사정이라, 들어올 때마다 다시 켜게 하면 성가시다.
    writeBackgroundEffect(next);
  }

  function handleTogglePip() {
    if (pipOpen) {
      closePip();
      return;
    }
    // 이 클릭이 창을 여는 데 필요한 사용자 제스처다
    void requestPip();
  }

  function handleToggleCamera() {
    setCameraOn((v) => {
      const next = !v;
      writeCameraOn(next);
      return next;
    });
  }

  function handleToggleMic() {
    setMicOn((v) => {
      const next = !v;
      writeMicOn(next);
      return next;
    });
  }

  async function handleLeave() {
    if (leaving) return;
    setLeaving(true);

    // 이번 세션을 종료 처리한다. 서버가 저장된 자세 이벤트를 집계해 점수를 계산한다.
    // 이걸 빠뜨리면 study_records 의 점수 컬럼이 NULL 로 남아 리포트에 쓸 값이 안 생긴다.
    //
    // 퇴장(leaveRoom)보다 반드시 먼저 부른다. 퇴장 API 가 점수 누락을 막으려고 서버에서
    // 세션을 대신 종료하는데(StudyRoomService.leave → endByUserExit), 퇴장을 먼저 하면
    // 마지막 동기화 값(최대 30초 전)으로 확정돼 버리고 이 종료 요청은 항상 409 가 된다 —
    // 마지막으로 flush 한 감지 구간도 점수 계산이 끝난 뒤에 저장되어 세션 점수에서 빠진다.
    // end 를 먼저 부르면 퇴장 쪽 종료는 "이미 종료면 아무것도 안 함"이라 조용히 통과한다.
    /** 서버가 집계한 종료 결과. 못 받으면 null 이고 아래에서 화면 값으로 대신한다 */
    let endResult: StudyEndResult | null = null;

    if (studyRecordId !== null) {
      try {
        // 진행 중이던 감지 구간을 먼저 닫아 보낸다. 확정된 건은 이미 저장돼 있지만, 나가는
        // 순간까지 이어지던 구간은 아직 아무도 안 보냈다. 서버는 종료 시점에 저장된 이벤트를
        // 집계하므로 여기서 기다리지 않으면 마지막 한 건이 통째로 빠진다.
        await Promise.all([
          chinRest.flushNow(),
          drowsiness.flushNow(),
          phone.flushNow(),
        ]);
        endResult = await endStudyRecord(studyRecordId, {
          // 서버는 받은 값으로 덮어쓴다. 재입장이면 지난 시간에 이번 세션을 더해 보내야 한다.
          focusedSeconds: totalFocusedSeconds,
          // 스트레칭·쉬는 시간도 함께 보낸다. 이유는 useStudyProgressSync 참고.
          breakSeconds: priorBreakSeconds + breakElapsed,
          awaySeconds: priorAwaySeconds + awayElapsed,
          endReason: 'USER_EXIT',
        });
      } catch (e) {
        // 이미 종료된 세션이면 409 다. 어느 쪽이든 창은 닫아야 한다.
        console.error('[end] 세션 종료 처리 실패 — 화면은 그대로 닫는다', e);

        // 응답만 유실됐을 수 있다 — 서버는 종료를 처리해 점수까지 저장했는데 응답이 오는 길에
        // 끊긴 경우, 화면이 근사 대비값(확정 못 받은 짧은 흐트러짐 포함, 졸음 미포함 알림 수)을
        // 보여주면 DB 와 다른 숫자가 뜬다. 한 번 다시 물어봐서 서버가 실제로 끝냈으면(endReason
        // 있음) 그 확정값을 쓴다. 409(이미 종료)도 같은 경로로 살아난다.
        try {
          const saved = await getStudyRecord(studyRecordId);
          if (saved.endReason !== null && saved.goodPostureRatio !== null) {
            endResult = {
              studyRecordId: saved.studyRecordId,
              leftAt: saved.leftAt ?? '',
              endReason: saved.endReason,
              totalStudySeconds: saved.totalStudySeconds,
              focusedSeconds: saved.focusedSeconds,
              badPostureSeconds: saved.badPostureSeconds,
              warningCount: saved.warningCount,
              goodPostureRatio: saved.goodPostureRatio,
              // 결과 화면은 위 필드만 읽는다. 점수들은 상세 응답에 없지만 여기서는 필요 없다.
              focusScore: 0,
              neckScore: 0,
              chinRestScore: 0,
              shoulderTiltScore: 0,
              totalScore: 0,
            };
            console.info('[end] 저장된 종료 결과를 다시 읽어 왔습니다');
          }
        } catch (refetchError) {
          // 재조회까지 실패하면 원래대로 화면 대비값으로 간다.
          console.warn('[end] 종료 결과 재조회 실패 — 화면 값으로 대신한다', refetchError);
        }
      } finally {
        // 성공이든 실패든 이 경로로 한 번 보냈다. 창 닫힘 대비 전송이 또 보내지 않게 한다.
        endAttempted.current = true;
      }
    }

    // 퇴장 시각을 서버에 남긴다. 이걸 빠뜨리면 참여자 목록에 계속 남아 있는 것으로 집계된다.
    // 위 종료 처리보다 뒤여야 한다(이유는 위 주석). 개발용 세션으로 들어온 경우 입장 기록이
    // 없어 404 가 나는데, 그렇다고 창을 못 닫으면 안 된다.
    const numericRoomId = Number(roomId);
    if (Number.isInteger(numericRoomId) && numericRoomId > 0) {
      try {
        await leaveRoom(numericRoomId);
      } catch (e) {
        console.error('[leave] 퇴장 기록 실패 — 화면은 그대로 닫는다', e);
      }
    }

    // 종료 화면이 읽을 수 있도록 타임랩스를 IndexedDB 로 넘긴다.
    // navigate(state) 로는 못 보낸다 — history.state 는 수백 KB 대에서 막힌다.
    // 실패해도 삼킨다(save 내부에서 처리). 타임랩스 때문에 종료가 막히면 안 된다.
    if (studyRecordId !== null) {
      await timelapse.save(String(studyRecordId));
    }

    const summary: StudySessionSummary = {
      roomId: roomId ?? '',
      roomTitle: room?.title ?? '',
      studyRecordId,
      // 서버에 남긴 값(priorFocusedSeconds + elapsed)과 같아야 한다.
      // 이번 세션분만 넣으면 새로고침한 뒤 종료했을 때 결과 화면이 그 뒤 시간만 보여준다.
      focusedSeconds: endResult?.focusedSeconds ?? totalFocusedSeconds,
      // 총 시간 = 집중+휴식+자리비움. 서버(syncProgress)와 같은 식으로 만든 대비값이다.
      totalStudySeconds:
        endResult?.totalStudySeconds ??
        totalFocusedSeconds +
          priorBreakSeconds +
          breakElapsed +
          priorAwaySeconds +
          awayElapsed,
      /*
        서버가 집계한 값을 그대로 쓴다. 못 받았을 때만(네트워크 실패·409) 화면 값으로 대신하고,
        그 경우에도 학습 시간을 넘지 않게 자른다.

        대비값은 확정 횟수 × 관찰 구간으로 구하지 않는다. 같은 구간에 두 자세가 동시에 확정되면 그
        시간을 두 번 세게 돼서 "집중 2분인데 나쁜 자세 3분" 같은 값이 나왔고, 반대로 확정되지
        않은 짧은 흐트러짐은 아예 0 이 됐다. 지금은 서버와 같은 규칙으로 화면이 직접 센 초
        (badPostureSeconds)를 쓴다 — 나쁘게 읽힌 초를 그대로 세고, 여러 자세가 동시에 나빠도
        1초로만 센다.

        턱 괴기는 브라우저만 아는 값이라 따로 더한다. 서버 자세와 겹친 초는 두 번 세지만,
        대비 경로라 근사치를 택했다(서버 쪽은 큰 값을 고르는 방식으로 겹침을 피한다).
      */
      postureWarningCount:
        endResult?.warningCount ??
        postureFrames.confirmedCount + chinRest.confirmedCount,
      badPostureSeconds:
        endResult?.badPostureSeconds ??
        Math.min(
          totalFocusedSeconds,
          postureFrames.badPostureSeconds + chinRest.badSeconds,
        ),
      stretchingCount: stretchingDoneCount,
      timelapseConsent: captureConsent === true,
    };

    clearEntry();
    navigate('/study/room/complete', { replace: true, state: summary });
  }

  /**
   * 자세 판정이 돌지 않는 이유. null 이면 정상 동작 중이다.
   *
   * 카운트를 올리는 수단이 서버뿐이라, 전송이 멈춘 걸 알리지 않으면 "아무 일도 안 일어나는
   * 정상 상태"와 구분되지 않는다.
   */
  function describeDetectionPause(): string | null {
    if (postureFrames.error) return postureFrames.error;
    if (studyRecordId === null)
      return '입장 기록이 없어 자세 판정을 시작할 수 없습니다';
    if (!cameraOn) return '카메라 꺼짐';
    return null;
  }

  /** 개발 패널용 한 줄 요약. 전송이 실제로 돌고 있는지 눈으로 확인한다. */
  function describePostureFrames() {
    if (postureFrames.error) return `⛔ ${postureFrames.error}`;
    if (studyRecordId === null) return '세션 id 없음 — 전송하지 않음';
    if (!cameraOn) return '카메라 꺼짐 — 전송 중지';

    const res = postureFrames.lastResponse;
    if (!res) return `session ${studyRecordId} · 첫 응답 대기 중`;

    const detail = res.judgements
      .map((j) => `${j.type}:${j.skipReason ? 'skip' : j.severity}`)
      .join(' ');
    return `session ${studyRecordId} · good=${res.goodPosture} · 확정 ${postureFrames.confirmedCount}회 · ${detail}`;
  }

  // 작은 창 헤더에 쓸 시간과 그 시간이 무엇인지. 큰 화면 헤더와 같은 규칙으로 고른다.
  // 코칭(자세 교정) 중에도 순공은 멈추는데, 큰 화면은 그때 전용 배지로 갈아끼워서
  // 이 문구가 없다. 작은 창은 배지를 따로 두지 않으므로 여기서 이유를 말해야 한다.
  const pipElapsedLabel = timerResting
    ? formatDuration(phaseRemaining ?? timerState.remainingSeconds ?? 0)
    : focusedTimeLoading
      ? '-'
      : formatDuration(totalFocusedSeconds);
  // 자세 교정 중은 빼 두었다. 이제 그때도 시간이 흐르므로 "일시정지"라고 적으면 거짓말이 된다.
  // 자세가 나쁘다는 것은 화면의 경고 배지가 이미 말해 준다.
  const pipElapsedNote = timerResting
    ? '쉬는 시간'
    : personMissing
      ? '일시정지 · 자리비움'
      : drowsiness.drowsy
        ? '일시정지 · 졸음'
        : phone.phoneVisible
          ? '일시정지 · 휴대폰'
          : '순공 시간';

  return (
    <div className={styles['study-room-page']}>
      <header className={styles['room-header']}>
        <span className={styles['live-badge']}>LIVE</span>
        <h1 className={styles['room-title']}>
          {room?.title ?? '불러오는 중...'}
        </h1>
        <span className={styles['header-divider']} aria-hidden />
        {/* 정원을 아직 모르는 동안(조회 중이거나 실패) 0 을 쓰면 "정원 0명인 방"으로 읽힌다.
            '-' 는 모른다는 뜻이라 오해가 없다 — 위 제목의 '불러오는 중...' 과 짝이다. */}
        <span className={styles['participant-count']}>
          <UsersIcon />
          참여자 {participants.length}/{room?.maxMembers ?? '-'}명
        </span>

        <div className={styles['header-actions']}>
          {/* 순공 시간. 자리비움·졸음이면 멈추고 그 이유를 라벨에 보여준다 —
              표시가 없으면 시계가 멈춘 것이 고장으로 보인다. */}
          {coachingActive ? (
            <CoachingHeaderBadge
              detectCounts={detectCounts}
              maxWarningCount={MAX_WARNING_COUNT}
              cameraOff={coaching.mode === 'camera-off'}
              cameraOffSeconds={coaching.elapsedSeconds}
              awayThresholdSeconds={AWAY_THRESHOLD_SECONDS}
            />
          ) : (
            // 쉬는 시간·스트레칭 구간에는 그 구간의 남은 시간을 대신 보여준다.
            // 순공 시간은 멈춘 채로 남아 있다가 집중 구간이 돌아오면 그 값에서 이어진다.
            //
            // 멈춤 표시는 쉬는 시간과 자리비움·졸음을 함께 본다. 둘 다 순공이 안 흐르는
            // 상태라 시계만 보면 고장으로 오해하는 건 똑같다.
            <span
              className={styles['elapsed']}
              data-paused={timerResting || idle}
            >
              <span className={styles['elapsed-dot']} aria-hidden />
              {timerResting
                ? // 첫 250ms 동안은 아직 못 셌으므로 서버가 준 값을 그대로 쓴다.
                  formatDuration(
                    phaseRemaining ?? timerState.remainingSeconds ?? 0,
                  )
                : focusedTimeLoading
                  ? '-'
                  : formatDuration(totalFocusedSeconds)}
              <span className={styles['elapsed-label']}>
                {/* 스트레칭 구간도 '쉬는 시간'으로 묶어 부른다. 공부가 아닌 시간이라는
                    점에서 같은데, 이름이 오가면 화면이 바뀐 것처럼 보인다.
                    방 전체가 쉬는 것이 먼저다 — 쉬는 시간에는 자리를 비워도
                    잃는 시간이 없으므로 자리비움을 알릴 이유가 없다. */}
                {timerResting
                  ? '쉬는 시간'
                  : personMissing
                    ? '일시정지 · 자리비움'
                    : drowsiness.drowsy
                      ? '일시정지 · 졸음'
                      : phone.phoneVisible
                        ? '일시정지 · 휴대폰'
                        : '순공 시간'}
              </span>

              {/* 집중 구간에서는 다음 쉬는 시간까지 얼마 남았는지 옆에 덧붙인다.
                  중간에 들어온 사람도 이 방의 사이클이 어디쯤인지 바로 알 수 있다.
                  쉬는 시간에는 왼쪽 숫자가 이미 카운트다운이라 붙이지 않는다. */}
              {timerState.running && !timerResting && (
                <span className={styles['next-phase']}>
                  쉬는 시간까지{' '}
                  {formatCountdown(
                    phaseRemaining ?? timerState.remainingSeconds ?? 0,
                  )}
                </span>
              )}
            </span>
          )}

          {/* 총 시간. 코칭 배지로 갈아끼우는 위 칸과 달리 늘 보인다 — 순공이 멈추는 상황
              (자리비움·쉬는 시간·자세 교정)이야말로 "시계가 살아 있나"를 확인하고 싶은
              때라, 그때 같이 사라지면 있으나 마나다. */}
          <span className={styles['total-elapsed']}>
            {formatDuration(priorTotalSeconds + totalElapsed)}
            <span className={styles['total-elapsed-label']}>총 시간</span>
          </span>

          <button
            type="button"
            onClick={handleLeave}
            className={styles['leave-btn']}
          >
            <ExitIcon />룸 나가기
          </button>
        </div>
      </header>

      {coachingActive && <CoachingStatusBar coaching={coaching} />}

      <div className={styles['room-body']}>
        <main className={styles['room-stage']}>
          {/* 실시간 신호등(postureLights)은 두 화면 모두 '내 영상 타일 왼쪽 위' 기준이다.
              스테이지에 얹으면 그리드에서 어긋난다 — 보드가 비율을 지키느라 가운데 정렬돼서
              창 크기에 따라 스테이지 모서리와 영상 모서리가 따로 논다. */}
          {/* 스트레칭 중에는 <video> 가 하나만 존재해야 하므로 뒤쪽은 비운다 */}
          {/* 작은 창이 열려 있으면 코칭 화면도 띄우지 않는다. 코칭 화면에는 로컬 영상이
              들어가는데 그 영상은 지금 작은 창 쪽에 있고, 사용자도 그쪽을 보고 있다.
              대신 그리드는 그대로 둔다 — 참여자 영상·음성이 끊기면 안 되기 때문이다. */}
          {stretchingOpen ? null : coachingActive && !pipOpen ? (
            <CoachingStage
              attachVideo={attachVideo}
              attachEffectCanvas={bgEffect.attachCanvas}
              userName={userName}
              cameraOn={cameraOn}
              coaching={coaching}
              active
              highlights={highlights}
              overlay={postureLights}
              recoveryEndsAt={recoveryEndsAt}
              caption={recoveryHint}
            />
          ) : (
            <VideoGrid
              participants={participants}
              attachSelfVideo={attachVideo}
              attachEffectCanvas={bgEffect.attachCanvas}
              remoteStreams={remoteStreams}
              selfOverlay={pipOpen ? null : postureLights}
              selfVideoDetached={pipOpen}
            />
          )}

          {/* 작은 창으로 넘어간 동안 영상 자리만 덮는다.
              사이드바(채팅·참여자)는 덮지 않는다 — 예전에는 room-body 를 통째로 덮어서
              작은 창을 켜는 순간 채팅을 읽지도 쓰지도 못했다. 헤더·컨트롤바도 그대로라
              마이크·카메라·화면 공유·룸 나가기를 계속 쓸 수 있다.
              아래 타일들은 지우지 않고 가리기만 한다 — 상대 영상·음성이 그 요소에 붙어 있다. */}
          {/* 이쪽은 큰 창 안의 버튼이라 이미 앞에 나와 있다. 그래도 같은 함수를 쓰는 건
              돌아가는 길이 둘로 갈리지 않게 하기 위해서다 — focus() 는 이미 앞에 있는
              창에 부르면 아무 일도 하지 않는다. */}
          {pipOpen && <PipParkedCover onReturn={handleReturnToRoomWindow} />}
        </main>

        <RoomSidebar
          participants={participants}
          messages={messages}
          onSendMessage={sendMessage}
          open={sidebarOpen}
          devIncomingFriendRequests={dev.incomingFriendRequests}
        />
      </div>

      <RoomControlBar
        micOn={micOn}
        cameraOn={cameraOn}
        onToggleMic={handleToggleMic}
        onToggleCamera={handleToggleCamera}
        screenSharing={screenShare.sharing}
        // 화상 연결 전(publisher 없음)에는 버튼을 비활성화한다.
        onToggleScreenShare={
          publisher
            ? () =>
                screenShare.sharing ? screenShare.stop() : screenShare.start()
            : undefined
        }
        sidebarOpen={sidebarOpen}
        onToggleSidebar={() => setSidebarOpen((v) => !v)}
        settingsItems={settingsItems}
        detectCounts={detectCounts}
        detectThreshold={MAX_WARNING_COUNT}
        activeParts={activeParts}
        detectionPaused={describeDetectionPause()}
        voiceGuidanceOn={voiceGuidanceOn}
        onToggleVoiceGuidance={
          speechSupported ? handleToggleVoiceGuidance : undefined
        }
        pipOn={pipOpen}
        // 스트레칭 중에는 막는다 — 미션을 확대된 화면에서 마쳐야 다시 켤 수 있다
        onTogglePip={
          pip.supported && !stretchingOpen ? handleTogglePip : undefined
        }
        pipDisabledReason={
          !pip.supported
            ? PIP_UNSUPPORTED_NOTICE
            : stretchingOpen
              ? '스트레칭을 마쳐야 작은 창으로 돌아갈 수 있습니다'
              : undefined
        }
        backgroundEffect={backgroundEffect}
        // 화면 공유 중에는 막는다. 송출 트랙은 하나뿐이라 지금 바꾸면 상대에게
        // 공유 화면 대신 내 얼굴이 나간다(useOpenVidu 의 usePublishedVideoTrack 참고).
        onChangeBackgroundEffect={
          screenShare.sharing ? undefined : handleChangeBackgroundEffect
        }
        backgroundEffectDisabledReason="화면 공유를 멈춘 뒤에 바꿀 수 있습니다"
      />

      {stretchingOpen && (
        <StretchingOverlay
          attachVideo={attachVideo}
          attachEffectCanvas={bgEffect.attachCanvas}
          state={stretching.state}
          triggerLabel={
            TRIGGER_LABEL[
              stretchTarget ?? activeStretching?.targetPart ?? ''
            ] ?? '거북목'
          }
          choices={activeStretching === null ? stretchChoices : undefined}
          onSelect={activeStretching === null ? setPickedStretching : undefined}
          triggerCount={MAX_WARNING_COUNT}
          onRetry={handleStretchingRetry}
          onPass={stretching.pass}
          onReturn={stretching.returnToRoom}
          liveHint={
            detection.supported
              ? detection.preparing
                ? '시작 자세를 잡아주세요…'
                : `${detection.hint} · ${detection.reps}/${detection.requiredReps}회`
              : undefined
          }
        />
      )}

      {/* 스트레칭 중에는 작은 창에 호출 판만 띄운다. 영상은 넣지 않는다 —
          그 사이 로컬 영상은 스트레칭 오버레이가 쓴다(요소가 둘이면 안 된다). */}
      {pip.pipWindow && stretchingOpen && (
        <StretchingCallPanel
          pipWindow={pip.pipWindow}
          triggerLabel={
            TRIGGER_LABEL[
              stretchTarget ?? activeStretching?.targetPart ?? ''
            ] ?? '자세'
          }
          onGo={handleReturnToRoomWindow}
        />
      )}

      {/* 작은 창(PiP). 스트레칭 중에는 위 호출 판이 대신 뜬다. */}
      {pip.pipWindow && !stretchingOpen && (
        <StudyPipPanel
          pipWindow={pip.pipWindow}
          lights={pipLights}
          attachVideo={attachVideo}
          attachEffectCanvas={bgEffect.attachCanvas}
          cameraOn={cameraOn}
          micOn={micOn}
          onToggleCamera={handleToggleCamera}
          onToggleMic={handleToggleMic}
          voiceGuidanceOn={voiceGuidanceOn}
          onToggleVoiceGuidance={
            speechSupported ? handleToggleVoiceGuidance : undefined
          }
          screenSharing={screenShare.sharing}
          // 컨트롤바와 같은 조건 — 화상 연결 전(publisher 없음)에는 막는다
          onToggleScreenShare={
            publisher
              ? () =>
                  screenShare.sharing ? screenShare.stop() : screenShare.start()
              : undefined
          }
          userName={userName}
          elapsedLabel={pipElapsedLabel}
          elapsedNote={pipElapsedNote}
          paused={timerResting || idle}
          warning={pipWarning}
          recoveryEndsAt={recoveryEndsAt}
          chips={pipChips}
          threshold={MAX_WARNING_COUNT}
          onReturn={handleReturnToRoomWindow}
        />
      )}

      {timerDialogOpen && roomId !== undefined && (
        <TimerSettingsDialog
          roomId={Number(roomId)}
          onClose={() => setTimerDialogOpen(false)}
        />
      )}

      <DevControls
        state={dev}
        onChange={setDev}
        postureStatus={describePostureFrames()}
        activeDetector={postureFrames.lastResponse?.detector ?? null}
      />

      {/* 확인용 — 감지된 휴대폰 위치를 얇은 검은 선으로 표시.
          스트레칭 중에는 <video> 가 오버레이 쪽으로, 작은 창을 켜면 그 창으로 옮겨간다.
          어느 쪽이든 이 화면에는 기준이 될 영상이 없으므로 그리지 않는다 */}
      {!stretchingOpen && !pipOpen && (
        <PhoneBoxOverlay videoRef={videoRef} box={phone.box} />
      )}

      {/* 휴대폰 감지 경고 (코칭·스트레칭 화면과 겹치지 않게 숨긴다) */}
      {phone.phoneVisible && !coachingActive && !stretchingOpen && (
        <DetectionAlert
          kind="PHONE"
          detail={
            import.meta.env.DEV
              ? `신뢰도 ${(phone.lastScore * 100).toFixed(0)}%`
              : undefined
          }
        />
      )}

      {/* 졸음 감지 경고. 휴대폰 배너와 자리가 같아서, 둘이 겹치면 휴대폰을 먼저 보여준다 */}
      {drowsiness.drowsy &&
        !phone.phoneVisible &&
        !coachingActive &&
        !stretchingOpen && (
          <DetectionAlert
            kind="DROWSY"
            detail={
              import.meta.env.DEV
                ? `누적 ${drowsiness.detectCount}회`
                : undefined
            }
          />
        )}
    </div>
  );
}
