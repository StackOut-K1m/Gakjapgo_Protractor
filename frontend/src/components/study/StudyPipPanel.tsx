// src/components/study/StudyPipPanel.tsx
import { createPortal } from 'react-dom';

import type { PostureLight } from '@/types/posture';
import type { TargetPart } from '@/types/stretching';
import type { CanvasRefCallback, VideoRefCallback } from '@/types/video';
import PostureRecoveryCountdown from './PostureRecoveryCountdown';
import SelfVideo from './SelfVideo';
import {
  MicIcon,
  MicOffIcon,
  ReturnIcon,
  ScreenShareIcon,
  SpeakerIcon,
  SpeakerOffIcon,
  VideoIcon,
} from './icons';
import styles from './StudyPipPanel.module.css';

/** PiP 창에 띄울 경고 한 건. 정상이면 null 을 넘긴다 */
export interface PipWarning {
  /** 어떤 분야의 경고인지 (예: '거북목 경고', '휴대폰 감지') */
  label: string;
  /** 무엇을 어떻게 고쳐야 하는지 */
  advice: string;
  icon: string;
  /** 자세 경고일 때만 있는 "3/5회". 스트레칭까지 얼마나 남았는지 보여준다 */
  progressLabel?: string;
}

/** 컨트롤바와 같은 부위별 누적 카운터 */
export interface PipDetectChip {
  part: TargetPart;
  label: string;
  count: number;
  /** 아직 해소되지 않은 경고인지 */
  active: boolean;
}

interface StudyPipPanelProps {
  /** 이 창의 body 에 그린다 */
  pipWindow: Window;
  attachVideo: VideoRefCallback;
  /** 배경 효과 캔버스. null 이면 효과가 꺼져 있다 */
  attachEffectCanvas?: CanvasRefCallback | null;
  cameraOn: boolean;
  micOn: boolean;
  /** 큰 화면의 컨트롤바와 같은 동작이다 — 상태도 하나를 같이 쓴다 */
  onToggleCamera: () => void;
  onToggleMic: () => void;
  /** 음성 안내 상태. 지원하지 않는 브라우저면 onToggleVoiceGuidance 가 없다 */
  voiceGuidanceOn: boolean;
  onToggleVoiceGuidance?: () => void;
  /** 화면 공유 중 여부 */
  screenSharing: boolean;
  /** 화면 공유 시작·중지. 화상 연결 전이면 없다(버튼이 비활성화된다) */
  onToggleScreenShare?: () => void;
  userName: string;
  /** 이미 서식을 맞춘 시간 문자열 */
  elapsedLabel: string;
  /** 그 시간이 무엇인지 ('순공 시간' / '쉬는 시간' / '일시정지 · 자리비움' …) */
  elapsedNote: string;
  /** 순공이 흐르지 않는 상태인지 — 점이 꺼진다 */
  paused: boolean;
  warning: PipWarning | null;
  /**
   * 경고가 모두 풀릴 것으로 보이는 시각(ms). 회복 중이 아니면 null.
   * 이때는 경고 줄 대신 남은 시간을 센다 — 큰 화면의 안내 문구와 같은 방식이다.
   */
  recoveryEndsAt: number | null;
  chips: PipDetectChip[];
  /** 이 횟수에 닿으면 스트레칭이 시작된다 */
  threshold: number;
  /**
   * 실시간 판정 한 줄(자세별 초록/빨강 점).
   *
   * 경고 줄(warning)은 확정된 것만 다루기 때문에, 확정 전 10초 동안은 이게 없으면
   * "자세 양호"라고 하면서 실제로는 나쁜 자세가 쌓이고 있는 화면이 된다.
   * 영상 위에 얹지 않고 상태 줄 자리에 가로로 그린다 — 얹으면 얼굴을 가린다(사용자 피드백).
   */
  lights: PipLightItem[];
  /** 큰 화면으로 돌아가기 (PiP 를 닫는다) */
  onReturn: () => void;
}

/** 실시간 판정 한 칸 — 점 색(light)과, 위험일 때의 "6/10초" 진행 표기 */
export interface PipLightItem {
  key: string;
  label: string;
  light: PostureLight;
  progressLabel?: string | null;
}

/**
 * 스터디룸을 작은 창 하나로 줄인 화면.
 *
 * <p>
 * Document Picture-in-Picture 창(늘 맨 위에 뜬다) 안에 포털로 그린다. 다른 일을 하는
 * 동안에도 <b>내 카메라</b>와 <b>지금 어떤 경고가 떠 있는지</b>가 계속 보이는 것이 이 화면의
 * 전부다. 참여자 타일·채팅은 넣지 않는다 — 좁은 창에서 다 보여주려다 정작 봐야 할 경고가
 * 묻힌다.
 *
 * <p>
 * 여기 있는 &lt;video&gt; 는 스터디룸 본 화면의 것과 <b>같은 로컬 스트림</b>을 쓴다.
 * attachVideo 는 요소가 붙을 때마다 스트림을 다시 연결하는 콜백 ref 라, 이 창이 열리면
 * 자세·졸음·휴대폰 판정이 모두 이쪽 요소를 보게 된다. 그래서 로컬 &lt;video&gt; 는 한 번에
 * 하나만 존재해야 한다 — 이 창이 열려 있는 동안 본 화면은 내 타일의 영상을 그리지 않는다.
 *
 * <p>
 * 경고 5회로 스트레칭이 시작되면 이 창은 강제로 닫힌다(StudyRoomPage 참고). 스트레칭은
 * 동작을 판정해야 해서 큰 화면이 필요하고, 작은 창에 남겨 두면 미션을 건너뛸 수 있다.
 *
 * <p>
 * <b>지표(부위별 카운터 + 상태 한 줄)는 영상보다 위에 둔다.</b> 사용자가 창을 끝까지
 * 줄이면 아래쪽부터 잘려 나가는데, 이 창을 띄우는 이유가 "지금 자세가 어떤지"를 보려는
 * 것이라 그게 먼저 사라지면 창이 남아 있을 이유가 없다. 자리를 양보하는 순서는
 * 영상 → 지표 → 돌아가기 버튼이다(버튼은 가장 자주 누르는 것이라 맨 위에 두고 끝까지 남긴다).
 *
 * <p>
 * 위에서부터 돌아가기 → 시간 → 카운터 → 상태 → 영상 순이다. 카운터가 상태 줄보다 위인 이유는,
 * 상태 줄이 경고(두 줄)와 양호(한 줄) 사이를 오가며 높이가 바뀌기 때문이다. 아래에 두면
 * 카운터 세 개가 그때마다 위아래로 움직여서, 흘깃 보고 숫자만 확인하기가 어려워진다.
 */
export default function StudyPipPanel({
  pipWindow,
  attachVideo,
  attachEffectCanvas,
  cameraOn,
  micOn,
  onToggleCamera,
  onToggleMic,
  voiceGuidanceOn,
  onToggleVoiceGuidance,
  screenSharing,
  onToggleScreenShare,
  userName,
  elapsedLabel,
  elapsedNote,
  paused,
  warning,
  recoveryEndsAt,
  chips,
  threshold,
  lights,
  onReturn,
}: StudyPipPanelProps) {
  return createPortal(
    <div className={styles['pip-panel']} data-warning={warning !== null}>
      <header className={styles['pip-head']}>
        <span className={styles['pip-elapsed']} data-paused={paused}>
          <span className={styles['pip-dot']} aria-hidden />
          {elapsedLabel}
        </span>
        <span className={styles['pip-note']}>{elapsedNote}</span>

        {/* 마이크·카메라는 작은 창에서도 바로 눌러야 하는 것들이다. 이걸 빼면 말 한마디
            하려고 큰 창을 다시 띄워야 한다. 큰 화면 컨트롤바와 같은 상태를 쓰므로
            어느 쪽에서 눌러도 양쪽 표시가 같이 바뀐다. */}
        <span className={styles['pip-actions']}>
          <button
            type="button"
            onClick={onToggleMic}
            className={styles['pip-icon-btn']}
            data-off={!micOn}
            aria-pressed={micOn}
            aria-label={micOn ? '음소거' : '음소거 해제'}
            title={micOn ? '음소거' : '음소거 해제'}
          >
            {micOn ? <MicIcon size={15} /> : <MicOffIcon size={15} />}
          </button>

          {/* 음성 안내는 이 창을 보고 있을 때 가장 거슬린다 — 눈으로 이미 보고 있는 것을
              소리로 또 듣게 되기 때문이다. 여기서 바로 끌 수 있어야 한다. */}
          <button
            type="button"
            onClick={onToggleVoiceGuidance}
            disabled={!onToggleVoiceGuidance}
            className={styles['pip-icon-btn']}
            data-muted={!voiceGuidanceOn}
            aria-pressed={voiceGuidanceOn}
            aria-label={voiceGuidanceOn ? '음성 안내 끄기' : '음성 안내 켜기'}
            title={voiceGuidanceOn ? '음성 안내 끄기' : '음성 안내 켜기'}
          >
            {voiceGuidanceOn ? (
              <SpeakerIcon size={15} />
            ) : (
              <SpeakerOffIcon size={15} />
            )}
          </button>

          <button
            type="button"
            onClick={onToggleCamera}
            className={styles['pip-icon-btn']}
            data-off={!cameraOn}
            aria-pressed={cameraOn}
            aria-label={cameraOn ? '비디오 끄기' : '비디오 켜기'}
            title={cameraOn ? '비디오 끄기' : '비디오 켜기'}
          >
            <VideoIcon size={15} />
          </button>

          {/* 화면 공유는 송출 트랙만 바꾸는 것이라 작은 창을 켜 둔 채로도 그대로 동작한다.
              버튼이 큰 창에만 있으면 공유를 켜려고 매번 돌아가야 해서 여기에도 둔다. */}
          <button
            type="button"
            onClick={onToggleScreenShare}
            disabled={!onToggleScreenShare}
            className={styles['pip-icon-btn']}
            data-on={screenSharing}
            aria-pressed={screenSharing}
            aria-label={screenSharing ? '화면 공유 중지' : '화면 공유'}
            title={
              onToggleScreenShare
                ? screenSharing
                  ? '화면 공유 중지'
                  : '화면 공유'
                : '화상 서버에 연결되지 않아 화면 공유를 쓸 수 없습니다'
            }
          >
            <ScreenShareIcon size={15} />
          </button>

          {/* 돌아가기. 가로 한 줄을 다 먹는 큰 버튼이었는데(사용자 피드백) 다른
              컨트롤과 같은 동그라미 크기로 줄여 이 줄에 합쳤다. */}
          <button
            type="button"
            onClick={onReturn}
            className={styles['pip-icon-btn']}
            data-return
            aria-label="스터디룸으로 돌아가기"
            title="스터디룸으로 돌아가기"
          >
            <ReturnIcon size={15} />
          </button>
        </span>
      </header>

      {/* 부위별 누적 횟수. 임계치에 닿으면 스트레칭이 시작되므로 남은 여유가 보여야 한다.
          아래 경고 줄보다 위에 둔다 — 경고는 떴다 사라지며 높이가 바뀌는데, 그 아래에
          있으면 카운터도 같이 움직여서 흘깃 볼 때마다 눈으로 다시 찾아야 한다. */}
      <div className={styles['pip-chips']}>
        {chips.map((chip) => (
          <span
            key={chip.part}
            className={styles['pip-chip']}
            data-active={chip.active}
            data-near={chip.count >= threshold - 1}
          >
            {chip.label} {chip.count}/{threshold}
          </span>
        ))}
      </div>

      {/* 자세를 고치는 중이면 경고 대신 남은 시간을 센다. 이 줄이 "지금 뭘 해야 하나"를
          말하는 자리라, 이미 고친 사람에게 계속 "바르게 앉으세요" 라고 하면 안 된다.
          어느 부위였는지는 바로 위 카운터가 계속 빨갛게 들고 있다.

          타이머는 이 창(PiP)에 건다 — 큰 창은 가려지면 1초 간격까지 느려진다. */}
      {recoveryEndsAt !== null ? (
        <PostureRecoveryCountdown
          className={styles['pip-recovery']}
          endsAt={recoveryEndsAt}
          timerWindow={pipWindow}
        />
      ) : warning ? (
        <div className={styles['pip-alert']} role="alert">
          <span className={styles['pip-alert-icon']} aria-hidden>
            {warning.icon}
          </span>
          <div className={styles['pip-alert-text']}>
            <strong className={styles['pip-alert-title']}>
              {warning.label}
              {warning.progressLabel && (
                <span className={styles['pip-alert-count']}>
                  {warning.progressLabel}
                </span>
              )}
            </strong>
            <span className={styles['pip-alert-desc']}>{warning.advice}</span>
          </div>
        </div>
      ) : (
        // 실시간 판정 한 줄. "자세 양호" 한 문장 대신 자세별 점 색으로 보여준다 —
        // 문장만으로는 확정 전 10초 동안 어느 자세가 쌓이고 있는지 알 수 없었다.
        <div className={styles['pip-lights']} role="status">
          {lights.map((item) => (
            <span
              key={item.key}
              className={styles['pip-light']}
              data-light={item.light}
            >
              <span className={styles['pip-light-dot']} aria-hidden />
              {item.label}
              {item.progressLabel && (
                <strong className={styles['pip-light-progress']}>
                  {item.progressLabel}
                </strong>
              )}
            </span>
          ))}
        </div>
      )}

      <div className={styles['pip-stage']} data-warning={warning !== null}>
        {/* 카메라를 꺼도 <video> 는 그대로 두고 안내만 덮는다. 여기서 요소를 없애면
            카메라를 껐다 켤 때마다 videoRef 가 null 을 거쳐 가는데, 이 창의 토글로
            그 일이 자주 생긴다. 큰 화면의 참여자 타일도 같은 이유로 같은 방식이다. */}
        <SelfVideo
          attachVideo={attachVideo}
          attachEffectCanvas={attachEffectCanvas}
          className={styles['pip-video']}
        />
        {!cameraOn && (
          <p className={styles['pip-camera-off']}>
            카메라가 꺼져 있어 자세를 볼 수 없습니다
          </p>
        )}
        <span className={styles['pip-name']}>{userName} (나)</span>
      </div>

    </div>,
    pipWindow.document.body,
  );
}
