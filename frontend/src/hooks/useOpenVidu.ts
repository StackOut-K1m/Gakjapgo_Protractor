// src/hooks/useOpenVidu.ts
import { useCallback, useEffect, useRef, useState } from 'react';
import { OpenVidu } from 'openvidu-browser';
import type { Publisher, Session, StreamManager } from 'openvidu-browser';

import { resetSpeaking, setSpeaking } from '@/stores/speakingStore';

/**
 * 다른 참여자의 화상 스트림. memberId 로 참여자 타일과 짝지어 화면에 붙인다.
 *
 * StreamManager 에 video 엘리먼트를 넘기면(addVideoElement) OpenVidu 가 재생을 맡는다.
 */
/**
 * 지금 무엇을 내보내고 있는지.
 *
 * 카메라·마이크 권한이 막혀도 되는 것만이라도 내보내기 때문에, 어떤 상태인지 화면이 알아야
 * "왜 내가 안 보이지"를 사용자에게 설명할 수 있다.
 */
export type PublishState = 'both' | 'video-only' | 'audio-only' | 'none';

export interface RemoteStream {
  /** OpenVidu 커넥션 id — React key 로 쓴다 */
  connectionId: string;
  /** 서버가 토큰 발급 때 실어 준 참여자 식별자(백엔드 memberId) */
  memberId: string | null;
  manager: StreamManager;
}

/**
 * OpenVidu 화상 세션 연결.
 *
 * 입장(join) 응답의 mediaToken 하나로 접속한다. 접속 주소가 토큰 안에 들어 있어
 * 별도 서버 주소 설정이 필요 없다(백엔드가 공개 주소로 바꿔서 내려준다).
 *
 * 내 카메라는 OpenVidu publisher 가 잡고, 다른 사람 영상은 streamCreated 이벤트로 받는다.
 * 자세 판정용 카메라(useCamera)와는 별개로 동작한다.
 */
export function useOpenVidu(
  mediaToken: string | null,
  me: { memberId: number | null; nickname: string },
) {
  const { memberId, nickname } = me;
  const [publisher, setPublisher] = useState<Publisher | null>(null);
  const [remotes, setRemotes] = useState<RemoteStream[]>([]);
  const [connected, setConnected] = useState(false);
  /** 실제로 무엇을 내보내고 있는지. 권한이 막힌 장치를 화면에 알리는 데 쓴다. */
  const [publishState, setPublishState] = useState<PublishState>('both');
  const sessionRef = useRef<Session | null>(null);

  useEffect(() => {
    if (!mediaToken) return;
    let alive = true;
    let stopSelfMeter: (() => void) | null = null;

    const ov = new OpenVidu();
    // 말하기 감지를 켠다. 이 설정이 없으면 publisherStartSpeaking 이 아예 오지 않는다.
    // interval 은 음량을 재는 주기(ms), threshold 는 말한다고 볼 기준(dB)이다.
    ov.setAdvancedConfiguration({
      publisherSpeakingEventsOptions: { interval: 200, threshold: -50 },
    });
    const session = ov.initSession();
    sessionRef.current = session;

    /** 말하기 이벤트의 주인을 타일 id 로 바꾼다. 본인 타일은 'me' 라는 고정 id 를 쓴다. */
    const toParticipantId = (data: string): string | null => {
      const speaker = parseMemberId(data);
      if (!speaker) return null;
      return speaker === String(memberId ?? '') ? 'me' : speaker;
    };

    // 다른 참여자의 말하기. 본인은 아래에서 로컬 음량으로 따로 판단하므로 여기서 걸러낸다.
    session.on('publisherStartSpeaking', (event) => {
      const id = toParticipantId(event.connection.data);
      if (id && id !== 'me') setSpeaking(id, true);
    });
    session.on('publisherStopSpeaking', (event) => {
      const id = toParticipantId(event.connection.data);
      if (id && id !== 'me') setSpeaking(id, false);
    });

    // 다른 참여자가 들어오거나 캠을 켜면 스트림이 생긴다. 구독해야 영상이 흐른다.
    session.on('streamCreated', (event) => {
      const manager = session.subscribe(event.stream, undefined);
      if (!alive) return;
      setRemotes((prev) => [
        ...prev,
        {
          connectionId: event.stream.connection.connectionId,
          memberId: parseMemberId(event.stream.connection.data),
          manager,
        },
      ]);
    });

    // 나가거나 캠을 끄면 스트림이 사라진다. 화면에서도 지운다.
    session.on('streamDestroyed', (event) => {
      if (!alive) return;
      const goneId = event.stream.connection.connectionId;
      setRemotes((prev) => prev.filter((r) => r.connectionId !== goneId));
      // 말하는 중에 나가면 멈춤 이벤트가 오지 않아 테두리가 켜진 채로 남는다.
      const goneParticipant = toParticipantId(event.stream.connection.data);
      if (goneParticipant) setSpeaking(goneParticipant, false);
    });

    session.on('exception', (exception) => {
      console.warn('[OpenVidu] exception:', exception.name, exception.message);
    });

    session
      // 여기 넣은 값이 상대방의 connection.data 로 도착한다. 어느 참여자의 영상인지 이걸로 짝짓는다.
      .connect(
        mediaToken,
        JSON.stringify({ memberId: String(memberId ?? ''), nickname }),
      )
      .then(async () => {
        if (!alive) return;
        setConnected(true);

        // 쓸 수 있는 장치만으로 발행한다. 자세한 이유는 PUBLISH_ATTEMPTS 주석 참고.
        const attempt = await publishWhatWeCan(ov);

        if (!alive) {
          // 연결이 취소된 뒤 발행이 끝나면 카메라가 계속 점유된다.
          attempt.publisher?.stream.disposeWebRtcPeer();
          attempt.publisher?.stream.disposeMediaStream();
          return;
        }

        setPublishState(attempt.state);
        if (!attempt.publisher) return;

        await session.publish(attempt.publisher);
        setPublisher(attempt.publisher);
        // 마이크가 없으면 음량을 잴 것도 없다.
        if (attempt.state === 'both' || attempt.state === 'audio-only') {
          stopSelfMeter = watchSelfSpeaking(attempt.publisher);
        }
      })
      .catch((error) => {
        // 접속 자체가 실패한 경우다. 발행 실패는 위에서 이미 처리했다.
        console.error('[OpenVidu] 접속 실패:', error);
        setPublishState('none');
      });

    return () => {
      alive = false;
      setConnected(false);
      setPublisher(null);
      setRemotes([]);
      stopSelfMeter?.();
      // 켜진 채로 남으면 다음 입장에서 테두리가 빛나는 상태로 시작한다.
      resetSpeaking();
      // disconnect 가 발행 중지·구독 해제·카메라 반납까지 처리한다.
      session.disconnect();
      sessionRef.current = null;
    };
    // memberId·nickname 은 접속 시 상대에게 보내는 정보라, 값이 바뀌면 다시 붙어야 한다.
  }, [mediaToken, memberId, nickname]);

  return { publisher, remotes, connected, publishState };
}

/**
 * 기본 발행 옵션. 아래 폴백들이 여기서 장치만 빼고 재사용한다.
 *
 * 16:9 로 보내는 이유는 타일이 16:9 이기 때문이다. 예전 640x480(4:3)은 비율이 달라서
 * 상대 화면에서 위아래가 잘려 보였다. 픽셀 수는 640x480 보다 적어 대역폭도 조금 준다.
 */
const PUBLISHER_OPTIONS = {
  audioSource: undefined,
  videoSource: undefined,
  publishAudio: true,
  publishVideo: true,
  resolution: '640x360',
  frameRate: 24,
  mirror: true,
} as const;

/**
 * 발행 시도 순서.
 *
 * <p>
 * 브라우저는 요청한 장치 중 하나라도 권한이 없으면 요청 전체를 거부한다(all-or-nothing).
 * 그래서 마이크만 막혀 있어도 카메라까지 못 쓰게 되고, 발행이 통째로 죽어 그 사람이
 * 다른 참여자에게 아예 보이지 않게 된다.
 *
 * <p>
 * 되는 장치만이라도 내보내려고 위에서부터 하나씩 시도한다. 전부 실패해도 접속과 구독은
 * 살아 있으므로 다른 사람 영상은 계속 받을 수 있다.
 */
const PUBLISH_ATTEMPTS: { state: PublishState; options: object }[] = [
  { state: 'both', options: PUBLISHER_OPTIONS },
  {
    state: 'video-only',
    options: { ...PUBLISHER_OPTIONS, audioSource: false, publishAudio: false },
  },
  {
    state: 'audio-only',
    options: { ...PUBLISHER_OPTIONS, videoSource: false, publishVideo: false },
  },
];

/** 쓸 수 있는 장치만으로 발행을 만든다. 하나도 못 쓰면 publisher 가 null 이다. */
async function publishWhatWeCan(
  ov: OpenVidu,
): Promise<{ publisher: Publisher | null; state: PublishState }> {
  for (const { state, options } of PUBLISH_ATTEMPTS) {
    try {
      const publisher = await ov.initPublisherAsync(undefined, options);
      if (state !== 'both') {
        console.warn(
          `[OpenVidu] 일부 장치를 쓸 수 없어 ${state} 로 발행합니다.`,
        );
      }
      return { publisher, state };
    } catch {
      // 다음 조합으로 넘어간다. 마지막까지 실패하면 아래에서 처리한다.
    }
  }
  console.warn('[OpenVidu] 카메라·마이크를 모두 쓸 수 없어 발행하지 않습니다.');
  return { publisher: null, state: 'none' };
}

/** 음량을 재는 주기(ms). 짧을수록 반응이 빠르지만 그만큼 자주 깨어난다. */
const SELF_METER_INTERVAL_MS = 200;
/** 말하기 시작으로 볼 음량. 0~255 평균값 기준이다. */
const SPEAK_START_LEVEL = 18;
/** 말하기 종료로 볼 음량. 시작보다 낮게 두어야 경계에서 테두리가 깜빡이지 않는다. */
const SPEAK_STOP_LEVEL = 10;

/**
 * 내가 말하고 있는지 로컬에서 판단한다.
 *
 * <p>
 * OpenVidu 의 말하기 이벤트는 다른 참여자 것만 확실히 오기 때문에, 본인 타일은 내 마이크
 * 스트림의 음량을 직접 재서 판단한다.
 *
 * <p>
 * 비용을 낮게 유지하는 게 중요하다. 같은 화면에서 자세 추론이 매 프레임 돌고 있어서,
 * 여기서 requestAnimationFrame 을 쓰면 그 경쟁에 끼어들게 된다. 그래서 프레임과 무관하게
 * 0.2초에 한 번만 깨어나 값을 읽는다. 사람이 말하는 단위에는 이 정도면 충분하다.
 *
 * <p>
 * 시작·종료 기준을 다르게 둔 이유는 히스테리시스다. 하나의 기준만 쓰면 그 근처 음량에서
 * 테두리가 켜졌다 꺼졌다를 반복한다.
 *
 * @return 정리 함수. 세션이 끝날 때 반드시 호출해야 오디오 자원이 남지 않는다
 */
function watchSelfSpeaking(publisher: Publisher): (() => void) | null {
  const track = publisher.stream?.getMediaStream()?.getAudioTracks()[0];
  if (!track) return null;

  let context: AudioContext;
  try {
    context = new AudioContext();
  } catch (error) {
    // 오디오 컨텍스트를 못 만들어도 화상·음성 자체는 정상이라 조용히 넘어간다.
    console.warn('[말하기 감지] 사용할 수 없습니다:', error);
    return null;
  }

  const source = context.createMediaStreamSource(new MediaStream([track]));
  const analyser = context.createAnalyser();
  // 값이 튀지 않게 이전 값을 섞어 준다. 낮추면 민감해지고 높이면 둔해진다.
  analyser.fftSize = 512;
  analyser.smoothingTimeConstant = 0.6;
  source.connect(analyser);

  const levels = new Uint8Array(analyser.frequencyBinCount);
  let speaking = false;

  const timer = window.setInterval(() => {
    analyser.getByteFrequencyData(levels);
    let sum = 0;
    for (const level of levels) sum += level;
    const average = sum / levels.length;

    // 마이크를 끄면 트랙이 꺼져 값이 0으로 떨어지므로 별도 처리가 필요 없다.
    if (!speaking && average >= SPEAK_START_LEVEL) {
      speaking = true;
      setSpeaking('me', true);
    } else if (speaking && average < SPEAK_STOP_LEVEL) {
      speaking = false;
      setSpeaking('me', false);
    }
  }, SELF_METER_INTERVAL_MS);

  return () => {
    window.clearInterval(timer);
    setSpeaking('me', false);
    source.disconnect();
    void context.close();
  };
}

/**
 * 화면 공유. 내보내는 영상만 카메라 → 화면으로 바꿔치기한다(트랙 교체 방식).
 *
 * <p>
 * 공유 중에는 상대에게 내 얼굴 대신 화면이 보이고, 중지하면 다시 카메라로 돌아온다.
 * 자세 인식은 별도 카메라 스트림을 쓰므로 공유 중에도 그대로 동작한다.
 *
 * <p>
 * 브라우저가 띄우는 "공유 중지" 버튼으로도 끝날 수 있어(onended), 그때도 카메라로 복귀시킨다.
 * 이걸 처리하지 않으면 공유가 끝났는데 상대 화면에 멈춘 마지막 프레임이 남는다.
 *
 * @param restoreTrack 공유가 끝났을 때 되돌릴 트랙. 배경 효과가 켜져 있으면 원본 카메라가
 *        아니라 효과가 걸린 트랙으로 돌아가야 한다 — 없거나 null 을 주면 카메라를 새로 잡는다
 */
export function useScreenShare(
  publisher: Publisher | null,
  restoreTrack?: () => MediaStreamTrack | null,
) {
  const [sharing, setSharing] = useState(false);
  /** 공유 중인 화면 스트림. 중지할 때 트랙을 꺼야 브라우저 상단의 공유 표시가 사라진다. */
  const screenStreamRef = useRef<MediaStream | null>(null);

  // 렌더마다 새로 만들어져도 start/stop 을 다시 만들지 않는다. 이 콜백이 바뀔 때마다
  // start 의 신원이 바뀌면 컨트롤바가 그때마다 다시 그려진다.
  const restoreTrackRef = useRef(restoreTrack);
  useEffect(() => {
    restoreTrackRef.current = restoreTrack;
  }, [restoreTrack]);

  /** 카메라 트랙으로 되돌린다. 공유 중지·실패 시 공통으로 쓴다. */
  const restoreCamera = useCallback(async () => {
    screenStreamRef.current?.getTracks().forEach((t) => t.stop());
    screenStreamRef.current = null;
    setSharing(false);
    if (!publisher) return;
    try {
      const effect = restoreTrackRef.current?.() ?? null;
      const track =
        effect ??
        (
          await navigator.mediaDevices.getUserMedia({ video: true })
        ).getVideoTracks()[0];
      await publisher.replaceTrack(track);
    } catch (error) {
      console.error('[화면공유] 카메라 복귀 실패:', error);
    }
  }, [publisher]);

  const start = useCallback(async () => {
    if (!publisher) return;
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
      });
      const track = stream.getVideoTracks()[0];
      // 브라우저 자체 "공유 중지" 버튼으로 끝난 경우에도 카메라로 돌아가야 한다.
      track.addEventListener('ended', () => void restoreCamera());
      await publisher.replaceTrack(track);
      screenStreamRef.current = stream;
      setSharing(true);
    } catch (error) {
      // 사용자가 공유 창에서 취소한 경우도 여기로 온다. 정상 흐름이라 조용히 지나간다.
      console.warn('[화면공유] 시작하지 않음:', error);
      setSharing(false);
    }
  }, [publisher, restoreCamera]);

  const stop = useCallback(() => void restoreCamera(), [restoreCamera]);

  // 방을 나갈 때 공유가 켜져 있으면 화면 캡처를 반드시 멈춘다.
  useEffect(() => {
    return () => {
      screenStreamRef.current?.getTracks().forEach((t) => t.stop());
      screenStreamRef.current = null;
    };
  }, []);

  return { sharing, start, stop };
}

/**
 * 카메라·마이크 토글을 실제 송출에 반영한다.
 *
 * 화면의 토글 상태만 바꾸면 상대방에게는 계속 내 영상·소리가 나간다.
 * publisher 에도 같은 값을 알려 줘야 실제로 꺼진다.
 */
export function usePublisherToggles(
  publisher: Publisher | null,
  cameraOn: boolean,
  micOn: boolean,
) {
  useEffect(() => {
    publisher?.publishVideo(cameraOn);
  }, [publisher, cameraOn]);

  useEffect(() => {
    publisher?.publishAudio(micOn);
  }, [publisher, micOn]);
}

/**
 * 배경 효과를 상대에게도 보낸다 — 내보내는 영상만 카메라 → 합성 캔버스로 바꿔치기한다.
 *
 * <p>
 * 화면 공유와 같은 트랙 교체 방식이다. 그래서 <b>공유 중에는 아무것도 하지 않는다</b> —
 * 둘이 같은 자리를 두고 다투면 공유를 켠 채 효과를 바꿨을 때 상대 화면이 내 얼굴로 돌아간다.
 * 공유가 끝날 때 어느 트랙으로 돌아갈지는 useScreenShare 의 restoreTrack 이 정한다.
 *
 * <p>
 * 효과를 끌 때 카메라를 새로 잡는 이유는 replaceTrack 이 이전 트랙을 놓아 버리기 때문이다.
 * publisher 가 처음 잡았던 트랙을 아껴 뒀다가 되돌리는 방법은 쓸 수 없다.
 *
 * @param effectTrack 효과가 걸린 트랙. null 이면 효과가 꺼진 것이라 카메라로 되돌린다
 * @param paused      지금은 손대면 안 되는 상태인지 (화면 공유 중)
 */
export function usePublishedVideoTrack(
  publisher: Publisher | null,
  effectTrack: MediaStreamTrack | null,
  paused: boolean,
) {
  /**
   * 지금 내보내고 있는 트랙. null 은 publisher 가 처음 잡은 카메라를 그대로 쓰는 중이라는 뜻이다.
   *
   * 이 값이 있어야 "바꿀 필요가 없는데 바꾸는" 일을 막을 수 있다. 특히 방에 막 들어와
   * 효과가 꺼져 있는 흔한 경우 — 여기서 카메라를 새로 잡아 갈아 끼우면, 아무 설정도 하지
   * 않은 사람의 영상이 입장 직후 한 번 끊긴다.
   */
  const publishedRef = useRef<MediaStreamTrack | null>(null);

  useEffect(() => {
    if (!publisher) {
      // 다시 접속하면 새 publisher 가 자기 카메라를 잡은 상태에서 시작한다.
      publishedRef.current = null;
      return;
    }
    // 공유 중에는 화면 트랙이 자리를 쥐고 있다. 공유가 끝나면 그쪽에서 되돌린다.
    if (paused) return;
    if (publishedRef.current === effectTrack) return;

    let cancelled = false;
    (async () => {
      /** 여기서 새로 잡은 카메라. 중간에 취소되면 반납해야 한다 */
      let opened: MediaStream | null = null;
      try {
        if (!effectTrack) {
          opened = await navigator.mediaDevices.getUserMedia({ video: true });
        }
        const track = effectTrack ?? opened?.getVideoTracks()[0];
        // 취소됐다면 방금 켠 카메라를 그대로 두면 안 된다 — 쓰지도 않으면서
        // 카메라 표시등만 켜진 채로 남는다.
        if (cancelled || !track) {
          opened?.getTracks().forEach((t) => t.stop());
          return;
        }
        await publisher.replaceTrack(track);
        publishedRef.current = effectTrack;
      } catch (error) {
        opened?.getTracks().forEach((t) => t.stop());
        console.error('[배경 효과] 송출 트랙을 바꾸지 못했습니다:', error);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [publisher, effectTrack, paused]);
}

/**
 * connection.data 에서 memberId 를 꺼낸다.
 *
 * 서버에서도 데이터를 넣으면 "서버데이터%/%클라이언트데이터" 형태로 합쳐져 오므로 조각을 모두 시도한다.
 * 형식이 예상과 다르면 null 로 두고, 그 영상은 참여자와 짝짓지 않는다.
 */
function parseMemberId(data: string | undefined): string | null {
  if (!data) return null;
  for (const part of data.split('%/%')) {
    try {
      const parsed = JSON.parse(part) as { memberId?: string };
      if (parsed?.memberId) return parsed.memberId;
    } catch {
      // 이 조각은 JSON 이 아니다. 다음 조각을 본다.
    }
  }
  return null;
}
