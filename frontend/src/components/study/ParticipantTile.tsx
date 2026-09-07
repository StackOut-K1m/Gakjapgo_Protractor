// src/components/study/ParticipantTile.tsx
import { memo, useCallback } from 'react';
import type { StreamManager } from 'openvidu-browser';
import { useIsSpeaking } from '@/stores/speakingStore';
import type { Participant } from '@/types/room';
import type { CanvasRefCallback, VideoRefCallback } from '@/types/video';
import SelfVideo from './SelfVideo';
import { MicIcon, MicOffIcon } from './icons';
import styles from './ParticipantTile.module.css';

interface ParticipantTileProps {
  participant: Participant;
  /** 본인 타일에만 로컬 스트림 ref를 넘긴다 */
  attachVideo?: VideoRefCallback;
  /** 본인 타일의 배경 효과 캔버스. null 이면 효과가 꺼져 있다 */
  attachEffectCanvas?: CanvasRefCallback | null;
  /** 다른 참여자의 화상 스트림. 있으면 이 타일에 상대 영상을 재생한다. */
  streamManager?: StreamManager;
  /**
   * 내 영상이 다른 창(PiP)으로 옮겨 갔는지.
   *
   * 로컬 스트림을 붙일 &lt;video&gt; 는 한 번에 하나만 있어야 한다 — 둘을 두면 나중에 붙은
   * 쪽이 videoRef 를 가져가고, 감지 훅들이 어느 요소를 보는지가 렌더 순서에 따라 달라진다.
   * 그래서 옮겨 간 동안 이 타일은 영상 대신 안내를 보여준다.
   */
  videoDetached?: boolean;
}

/**
 * 참여자 한 명의 화상 타일.
 *
 * memo 로 감싼다 — 자세 신호등이 1초마다 갱신되면서 VideoGrid 가 다시 그려지는데,
 * 그때마다 타일까지 따라 그리면 자세 추론이 도는 메인 스레드에서 그 비용이 끊김으로 보인다.
 */
function ParticipantTile({
  participant,
  attachVideo,
  attachEffectCanvas,
  streamManager,
  videoDetached = false,
}: ParticipantTileProps) {
  const { name, isSelf, cameraOn, micOn, coachingState } = participant;

  // 마이크를 끈 사람은 표시하지 않는다. 꺼진 마이크로 말해도 상대에겐 안 들리는데
  // 테두리만 빛나면 말이 전달되고 있다고 오해하게 된다.
  const speaking = useIsSpeaking(participant.id) && micOn;

  /**
   * 원격 영상 붙이기. OpenVidu 가 직접 요소를 잡아 재생한다(addVideoElement).
   *
   * <p>
   * 효과(useEffect)가 아니라 ref 콜백을 쓰는 이유가 있다. 아래 video 요소는 상대의
   * 카메라 on/off 에 따라 생겼다 사라지는데, 효과로 붙이면 "스트림이 바뀔 때"만 실행되므로
   * 스트림이 이미 도착한 뒤에 요소가 새로 생기는 순서에서는 붙이기가 영영 실행되지 않는다.
   * 그러면 미디어는 정상적으로 도착하는데 빈 요소만 남아 화면이 까맣게 보인다.
   *
   * <p>
   * ref 콜백은 요소가 붙을 때마다 호출되므로 순서가 어긋날 수 없다.
   */
  const attachRemoteVideo = useCallback(
    (el: HTMLVideoElement | null) => {
      if (el && streamManager) streamManager.addVideoElement(el);
    },
    [streamManager],
  );

  // 상대가 카메라를 껐으면 스트림이 있어도 영상 대신 안내를 보여준다.
  const hasRemoteVideo = !isSelf && !!streamManager && cameraOn;

  // 영상 위에 덮는 안내. 내 타일은 카메라를 꺼도 <video> 를 그대로 두고(트랙만 끈다)
  // 이 판만 위에 덮는다 — 요소를 없애면 다시 켤 때 스트림을 새로 붙여야 한다.
  const showPlaceholder = !isSelf
    ? !hasRemoteVideo
    : !cameraOn || videoDetached;

  /** 안내 판에 적을 이유. null 이면 아바타만 보여준다(상대가 아직 안 들어온 경우 등) */
  const placeholderLabel =
    isSelf && videoDetached
      ? '작은 창에서 보는 중'
      : !cameraOn
        ? '카메라 꺼짐'
        : null;

  return (
    <div
      className={styles['participant-tile']}
      data-speaking={speaking ? 'true' : undefined}
      // 경고·스트레칭이면 말하는 중 테두리보다 이쪽을 먼저 보여준다. 테두리는 하나뿐이라
      // 둘 다 그릴 수 없는데, 누가 말하는지보다 누가 자세를 흐트러뜨렸는지가 이 방의 용건이다.
      data-coaching={coachingState !== 'none' ? coachingState : undefined}
    >
      {isSelf && !videoDetached && attachVideo && (
        <SelfVideo
          attachVideo={attachVideo}
          attachEffectCanvas={attachEffectCanvas}
          className={styles['tile-video']}
        />
      )}

      {hasRemoteVideo && (
        <video
          ref={attachRemoteVideo}
          autoPlay
          playsInline
          className={styles['tile-video']}
          data-screen-share={participant.screenSharing}
        />
      )}

      {showPlaceholder && (
        <div className={styles['tile-placeholder']}>
          <span className={styles['tile-avatar']}>
            {participant.profileImageUrl ? (
              <img src={participant.profileImageUrl} alt="" />
            ) : (
              name.at(0)
            )}
          </span>
          {placeholderLabel && (
            <span className={styles['tile-placeholder-label']}>
              {placeholderLabel}
            </span>
          )}
        </div>
      )}

      {/* 경고·스트레칭 알림 배지.
          테두리 색만으로는 두 상태를 구분하기 어렵고, 처음 보는 사람은 무슨 뜻인지 알 수 없다.
          현재 사용자가 경고 때 보는 토스트(CoachingStage.stage-toast)와 같은 자리·모양이다. */}
      {coachingState !== 'none' && (
        <span
          className={styles['tile-coaching-badge']}
          data-coaching={coachingState}
          role="status"
        >
          {coachingState === 'warning' ? '경고 상태입니다' : '스트레칭 중입니다'}
        </span>
      )}

      <span className={styles['tile-name']}>
        {name}
        {isSelf && <span className={styles['tile-name-sub']}>(나)</span>}
      </span>

      <span className={styles['tile-mic']} data-off={!micOn}>
        {micOn ? <MicIcon size={16} /> : <MicOffIcon size={16} />}
      </span>
    </div>
  );
}
export default memo(ParticipantTile);
