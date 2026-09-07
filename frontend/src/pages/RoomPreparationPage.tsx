// src/pages/RoomPreparationPage.tsx
import axios from 'axios';
import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import CameraPreview from '../components/study/CameraPreview';
import PostureStatusBadge from '../components/study/PostureStatusBadge';
import { saveCalibration } from '../api/postureApi';
import { getStudyRoom, joinRoom } from '../api/studyRoomApi';
import { useCamera } from '../hooks/useCamera';
import { usePostureDetection } from '../hooks/usePostureDetection';
import { averageBaseline } from '../lib/pose/postureFeatures';
import { clearRoomPassword, readRoomPassword } from '../utils/roomPassword';
import { useAuthStore } from '../stores/useAuthStore';
import { useRoomEntryStore } from '../stores/useRoomEntryStore';
import type { PostureFeatures } from '../types/posture';
import type { StudyRoomDetailDto } from '../types/room';
import styles from './RoomPreparationPage.module.css';

const RETRY_HINT_SECONDS = 15;

/** 기준선 표본 수집 시간과 간격 — 5초 동안 100ms 마다 모아 최대 50 프레임 */
const CALIBRATION_SECONDS = 5;
const CALIBRATION_SAMPLE_MS = 100;

/** 이보다 표본이 적으면 기준선을 믿을 수 없다 */
const MIN_CALIBRATION_SAMPLES = 10;

/**
 * 수집 중 이 시간 이상 연속으로 자세가 흐트러지면 중단한다.
 *
 * 등록 버튼이 켜진 뒤 5초 사이에 딴짓을 해도 그대로 저장되던 구멍을 막는다.
 * 프레임 하나가 튀는 것까지 중단하면 정상 등록도 자꾸 끊기므로(감지가 30fps 라
 * 흔들림이 잦다) 연속 시간으로 본다.
 */
const CALIBRATION_BAD_STREAK_MS = 800;

/**
 * join API 가 실패했을 때 쓰는 개발용 세션 id. VITE_DEV_SESSION_ID 를 직접 넣은 경우에만 쓴다.
 *
 * 기본값을 두면 안 된다. 서버에 없는 세션 id 로 자세 판정을 시작하면 매 요청이 404 가 되고,
 * 화면에는 "기준선 또는 세션을 찾을 수 없습니다 — 캘리브레이션을 다시 해주세요" 만 보여
 * 실제 원인(입장 실패)을 찾을 수 없다. 값을 넣을 때는 DB 에 실제로 있는,
 * 본인 회원 id 로 만들어진 study_record_id 여야 한다.
 */
const DEV_SESSION_ID_RAW = import.meta.env.VITE_DEV_SESSION_ID;
const DEV_SESSION_ID =
  DEV_SESSION_ID_RAW && Number.isInteger(Number(DEV_SESSION_ID_RAW))
    ? Number(DEV_SESSION_ID_RAW)
    : null;

/**
 * 'idle' 은 아직 등록을 누르지 않은 상태, 'running' 은 표본 수집 중.
 *
 * 예전에는 바른 자세가 인식되는 순간 자동으로 'running' 에 들어갔다. 그런데 준비 화면의
 * 판정은 고개 숙임과 어깨 기울기만 보고 거북목은 보지 않기 때문에(usePostureDetection.ts),
 * 목을 앞으로 뺀 채로도 통과한다. 그 상태가 그대로 기준선이 되면 서버 판정은 기준선 대비
 * 편차로 하므로 그 세션 내내 거북목이 '정상'이 되어 한 번도 잡히지 않는다.
 * 사용자가 자세를 고칠 틈을 주기 위해 시작을 버튼으로 뺐다.
 */
type CalibrationStatus =
  | 'idle'
  | 'running'
  | 'saved'
  | 'failed'
  /** 수집 중 자세가 흐트러져 중단됨 — 저장 실패(failed)와 달리 입장도 막는다 */
  | 'interrupted';

/** 방 번호가 양의 정수인지. "null"·"abc" 같은 값이 들어오면 false */
function parseRoomId(raw: string | undefined): number | null {
  if (!raw) return null;
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
}

export default function RoomPreparationPage() {
  const { roomId } = useParams<{ roomId: string }>();
  const navigate = useNavigate();
  const setVerified = useRoomEntryStore((s) => s.setVerified);
  const memberId = useAuthStore((s) => s.member?.memberId ?? null);

  const numericRoomId = parseRoomId(roomId);
  /** 입장 실패 사유. 화면에 띄워 사용자가 원인을 알 수 있게 한다 */
  const [enterError, setEnterError] = useState('');

  const { videoRef, status: cameraStatus, restart } = useCamera();
  const {
    status: detection,
    blockedReason,
    latestFeatures,
    latestPose,
  } = usePostureDetection(videoRef, cameraStatus === 'connected');

  const [elapsed, setElapsed] = useState(0);
  const [calibration, setCalibration] = useState<CalibrationStatus>('idle');
  /** 기준선 수집이 끝나기까지 남은 초. 버튼에 표시한다 */
  const [countdown, setCountdown] = useState(CALIBRATION_SECONDS);
  const [entering, setEntering] = useState(false);
  const [room, setRoom] = useState<StudyRoomDetailDto | null>(null);

  // 방 정보(제목·정원·현재 인원) 조회. 비로그인도 조회 가능한 API다.
  // 방 번호가 유효하지 않으면 호출하지 않는다 (예전에는 /study-rooms/NaN 으로 400이 났다).
  useEffect(() => {
    if (numericRoomId === null) return;
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
  }, [numericRoomId]);

  useEffect(() => {
    if (detection === 'verified') return;
    const id = setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [detection]);

  const calibrating = calibration === 'running';

  /**
   * 지금 프레임의 차단 사유. 수집 루프가 매 표본마다 읽는다.
   *
   * state(blockedReason)를 그대로 쓰지 않는 이유는 효과 의존성 때문이다 — 의존성에 넣으면
   * 사유가 바뀔 때마다 수집 효과가 다시 시작돼 모아 둔 표본이 통째로 사라진다.
   */
  const blockedReasonRef = useRef(blockedReason);
  useEffect(() => {
    blockedReasonRef.current = blockedReason;
  }, [blockedReason]);

  /**
   * 사용자가 등록을 누른 시점부터 기준선을 잡는다.
   *
   * 방에 들어간 뒤에 잡지 않는 이유는 그 몇 초가 바른 자세라는 보장이 없기 때문이다.
   * 잘못 잡힌 기준선은 세션 내내 오탐이나 미탐으로 남는다.
   *
   * 수집 중에도 프레임 판정을 계속 본다 — 버튼이 켜진 뒤 5초 사이에 자세를 흐트러뜨려도
   * 그대로 저장되던 구멍이 있었다. 흐트러진 프레임은 표본에서 빼고, 연속으로 이어지면
   * (CALIBRATION_BAD_STREAK_MS) 수집을 중단해 다시 등록하게 한다. 'verified' 상태를
   * 조건으로 걸지 않는 것은 여전하다 — 그건 여러 프레임 연속 통과라 하나만 튀어도 떨어져서,
   * 정상 등록까지 자꾸 처음으로 돌아간다.
   */
  useEffect(() => {
    if (!calibrating) return;

    let cancelled = false;
    const samples: PostureFeatures[] = [];
    const startedAt = Date.now();
    let shownSecond = CALIBRATION_SECONDS;
    /** 자세가 흐트러진 채 지난 연속 표본 수 */
    let badStreak = 0;

    const timer = setInterval(async () => {
      if (cancelled) return;

      const f = latestFeatures.current;
      const bad = f === null || blockedReasonRef.current !== null;
      if (bad) {
        badStreak += 1;
        if (badStreak * CALIBRATION_SAMPLE_MS >= CALIBRATION_BAD_STREAK_MS) {
          clearInterval(timer);
          setCalibration('interrupted');
          return;
        }
      } else {
        badStreak = 0;
        samples.push(f);
      }

      const spent = Date.now() - startedAt;
      if (spent < CALIBRATION_SECONDS * 1000) {
        // 남은 초가 바뀔 때만 setState — 100ms 마다 화면을 다시 그리지 않는다
        const remaining = Math.ceil(CALIBRATION_SECONDS - spent / 1000);
        if (remaining !== shownSecond) {
          shownSecond = remaining;
          setCountdown(remaining);
        }
        return;
      }

      clearInterval(timer);

      if (memberId === null) {
        console.warn(
          '[calibration] 로그인 정보가 없어 기준선을 저장하지 않습니다.',
        );
        setCalibration('failed');
        return;
      }
      if (samples.length < MIN_CALIBRATION_SAMPLES) {
        console.warn(
          `[calibration] 표본이 ${samples.length}개뿐이라 기준선을 저장하지 않습니다.`,
        );
        setCalibration('failed');
        return;
      }

      try {
        await saveCalibration(averageBaseline(samples));
        if (!cancelled) setCalibration('saved');
      } catch (e) {
        console.error('[calibration] 기준선 저장 실패', e);
        if (!cancelled) setCalibration('failed');
      }
    }, CALIBRATION_SAMPLE_MS);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [calibrating, memberId, latestFeatures]);

  // 카메라가 차단되면 감지가 시작되지 않아 기존 조건(not-found 15초)으로는 재시도 버튼이
  // 영영 안 나온다. 권한을 허용으로 바꾼 뒤 바로 다시 시도할 수 있게 차단 상태에선 즉시 보여준다.
  const showRetry =
    cameraStatus === 'denied' ||
    (detection === 'not-found' && elapsed >= RETRY_HINT_SECONDS);

  /** 기준 자세를 등록할 수 있는 상태 — 바르게 인식됐고 아직 수집 중이 아닐 때 */
  const canCalibrate = detection === 'verified' && !calibrating && !entering;

  /**
   * 기준 자세를 등록하기 전에는 입장할 수 없다. 기준선 없이 들어가면 서버가 3종 자세를 모두
   * NO_BASELINE 으로 보류해서, 화면은 멀쩡한데 자세 판정만 조용히 꺼진 세션이 된다.
   *
   * 저장에 실패한 경우는 막지 않는다. 서버가 잠깐 안 되는 동안 공부 자체를 못 하게 되는 건
   * 과하다. 대신 버튼을 초록으로 바꾸지 않고 안내 문구로 상태를 알린다.
   */
  const canEnter =
    (calibration === 'saved' || calibration === 'failed') && !entering;

  function handleRetry() {
    setElapsed(0);
    setCalibration('idle');
    setCountdown(CALIBRATION_SECONDS);
    restart();
  }

  function handleStartCalibration() {
    setCountdown(CALIBRATION_SECONDS);
    setCalibration('running');
  }

  /**
   * 입장. 서버에서 studyRecordId(= 세션 id)를 받아 스토어에 넣는다.
   *
   * join 이 실패해도 방 화면으로는 들어간다. 화상 없이 자세 판정만 확인하는 개발 흐름을
   * 막고 싶지 않기 때문이다. 다만 세션 id 는 서버가 준 값이 아니면 비워 둔다 —
   * 없는 id 를 채우면 자세 판정이 매 요청 404 를 맞으면서도 원인이 캘리브레이션처럼 보인다.
   */
  async function handleEnter() {
    if (numericRoomId === null || !roomId) return;
    setEntering(true);
    setEnterError('');

    let studyRecordId: number | null = null;
    // 화상 접속 토큰. join 이 실패하면 없이 들어가고, 그때는 영상만 안 나온다.
    let mediaToken: string | null = null;

    try {
      const joined = await joinRoom(numericRoomId, {
        cameraChecked: true,
        postureChecked: true,
        // 잠긴 방이면 방을 고른 창에서 이미 받아 뒀다. 공개 방이면 null 이라 안 실린다.
        password: readRoomPassword(roomId),
      });
      studyRecordId = joined.studyRecordId;
      mediaToken = joined.mediaToken;
    } catch (e) {
      console.error('[join] 스터디룸 입장 실패', e);

      // 비밀번호가 거절됐다. 방을 고를 때 확인을 거쳤는데도 여기까지 왔다면 그 사이 방장이
      // 비밀번호를 바꿨거나, 확인을 건너뛰고 들어온 것이다.
      //
      // 이 화면에는 비밀번호를 다시 받을 자리가 없다 — 입력 창은 방을 고른 창에 있다. 그래서
      // 저장된 값을 지우고 그 창으로 돌아가라고 안내한다. 값을 지워야 다음에 입장을 눌렀을 때
      // 비밀번호 창이 다시 뜬다(남겨 두면 "값이 있으니 물을 필요 없다"고 판단해 그냥 열린다).
      if (axios.isAxiosError(e) && e.response?.status === 403) {
        clearRoomPassword();
        setEnterError(
          '비밀번호가 올바르지 않습니다. 이 창을 닫고 방 목록에서 다시 입장해 주세요.',
        );
        setEntering(false);
        return;
      }
    }

    if (studyRecordId === null) {
      // 개발 환경에서는 OpenVidu 없이도 자세 판정을 확인할 수 있게 폴백을 허용한다.
      // 배포에서는 폴백을 쓰면 안 된다 — 존재하지 않는 세션 id 로 들어가서
      // posture-frames 가 매 요청 404 를 내고, 화면은 정상처럼 보여 아무도 모른다.
      // DEV_SESSION_ID 는 VITE_DEV_SESSION_ID 를 직접 넣은 경우에만 값이 있다(기본값 없음).
      if (import.meta.env.DEV && DEV_SESSION_ID !== null) {
        studyRecordId = DEV_SESSION_ID;
        console.warn(`[join] 개발용 세션 id 사용: ${studyRecordId}`);
      } else {
        setEnterError(
          '스터디룸 입장에 실패했습니다. 잠시 후 다시 시도해 주세요.',
        );
        setEntering(false);
        return;
      }
    }

    setVerified(roomId, studyRecordId, mediaToken);
    navigate(`/study/room/${roomId}`);
  }

  // 방 번호가 유효하지 않으면 아무것도 진행하지 않는다.
  // 그냥 통과시키면 방 조회·입장·자세 판정이 모두 실패한 채로 화면은 정상처럼 보이고,
  // 사용자는 기준 자세까지 찍은 뒤 방에 들어가서야 아무것도 동작하지 않는 걸 알게 된다.
  if (numericRoomId === null) {
    return (
      <div className={styles['preparation-page']}>
        <div className={styles['preparation-inner']}>
          <div className={styles['invalid-room']}>
            <h1 className={styles['invalid-room-title']}>
              잘못된 스터디룸 주소입니다
            </h1>
            <p className={styles['invalid-room-desc']}>
              주소의 방 번호가 올바르지 않습니다. 홈에서 스터디룸을 다시 선택해
              주세요.
            </p>
            <button
              type="button"
              onClick={() => navigate('/', { replace: true })}
              className={styles['enter-btn']}
              data-active
            >
              홈으로 가기
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles['preparation-page']} data-status={detection}>
      <div className={styles['preparation-inner']}>
        <div className={styles['room-info-bar']}>
          <span className={styles['live-badge']}>LIVE</span>
          <h1 className={styles['room-title']}>
            {room?.title ?? '불러오는 중...'}
          </h1>
          <span className={styles['room-divider']} aria-hidden />
          <span className={styles['participant-count']}>
            {/* 방 정보를 아직 못 읽었으면 0 대신 '-'. 0/0 은 "아무도 없는 정원 0 인 방"
                으로 읽혀서, 조회가 안 끝난 것과 구분되지 않는다. */}
            참여자 {room?.currentMembers ?? '-'}/{room?.maxMembers ?? '-'}명
          </span>
          <span
            className={styles['camera-status']}
            data-connected={cameraStatus === 'connected'}
          >
            <span className={styles['status-dot']} aria-hidden />
            {cameraStatus === 'connected'
              ? '카메라 감지됨'
              : '카메라 연결 안됨'}
          </span>
        </div>

        <CameraPreview
          videoRef={videoRef}
          cameraStatus={cameraStatus}
          detection={detection}
          poseRef={latestPose}
        />

        <div className={styles['action-area']}>
          <PostureStatusBadge
            status={detection}
            elapsedSeconds={elapsed}
            blockedReason={blockedReason}
          />

          {showRetry && (
            <button
              type="button"
              onClick={handleRetry}
              className={styles['retry-btn']}
            >
              ↻ 다시 인식하기
            </button>
          )}

          {/* 기준선이 저장되면 다시 등록할 일이 없으므로 버튼을 감춘다.
              실패했을 때는 남겨서 재시도할 수 있게 한다. */}
          {calibration !== 'saved' && (
            <button
              type="button"
              disabled={!canCalibrate}
              onClick={handleStartCalibration}
              className={styles['calibrate-btn']}
            >
              {calibrating
                ? `기준 자세 측정 중... ${countdown}초`
                : calibration === 'failed' || calibration === 'interrupted'
                  ? '기준 자세 다시 등록하기'
                  : '이 자세를 기준으로 등록'}
            </button>
          )}

          <button
            type="button"
            disabled={!canEnter}
            onClick={handleEnter}
            className={styles['enter-btn']}
            data-ready={calibration === 'saved' || undefined}
          >
            {entering ? '입장하는 중...' : '스터디 입장하기'}
          </button>

          {enterError && (
            <p className={styles['enter-error']} role="alert">
              {enterError}
            </p>
          )}

          <p className={styles['action-hint']}>{hintText()}</p>
        </div>
      </div>
    </div>
  );

  function hintText() {
    if (cameraStatus === 'denied') {
      return '카메라 권한이 차단되어 있습니다. 주소창 오른쪽 카메라 아이콘에서 허용으로 바꾼 뒤 다시 인식하기를 눌러주세요';
    }
    if (calibrating) {
      return '지금 자세를 기준으로 삼습니다. 측정이 끝날 때까지 그대로 유지해주세요';
    }
    if (calibration === 'interrupted') {
      return '측정 중 자세가 흐트러져 등록이 중단되었습니다. 바른 자세가 다시 인식되면 처음부터 등록해주세요';
    }
    if (calibration === 'failed') {
      return '기준 자세 저장에 실패했습니다. 다시 등록하거나, 이대로 입장하면 자세 판정 없이 진행됩니다';
    }
    if (calibration === 'saved') {
      return '기준 자세가 등록되었습니다. 입장하면 실시간 자세 분석이 시작됩니다';
    }
    if (showRetry) {
      return '사용자가 인식되어야 자세 측정과 스터디 입장이 가능합니다';
    }
    // 여기서 등록한 자세가 이번 세션 내내 '내 바른 자세'의 기준이 된다.
    // 거북목인 채로 등록하면 그 거북목이 정상이 되어 세션 내내 아무 경고도 뜨지 않는다.
    return canCalibrate
      ? `등록한 자세가 이번 세션의 기준이 됩니다. 귀가 어깨보다 앞으로 나오지 않게 목을 세운 뒤 ${CALIBRATION_SECONDS}초간 유지해주세요`
      : '바른 자세가 실시간 감지되면 기준 자세를 등록할 수 있습니다';
  }
}
