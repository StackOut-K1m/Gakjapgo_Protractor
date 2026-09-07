// src/hooks/useCamera.ts
import { useCallback, useEffect, useRef, useState } from 'react';
import type { CameraStatus } from '@/types/posture';

export function useCamera() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [status, setStatus] = useState<CameraStatus>('idle');
  const [attempt, setAttempt] = useState(0);

  /** 요소와 스트림을 연결하고 재생을 보장한다 */
  function bind(el: HTMLVideoElement | null, stream: MediaStream | null) {
    if (!el || !stream) return;
    if (el.srcObject !== stream) {
      el.srcObject = stream;
    }
    // 요소가 교체되면 자동 재생이 멈추는 경우가 있어 명시적으로 재생시킨다.
    // paused 만 보면 부족하다 — PiP·스트레칭으로 요소가 옮겨 다닌 뒤 재생 중인데도
    // readyState 가 0 에 머무는 경우가 있었고(srcObject 는 있는데 프레임이 안 나옴),
    // 그 상태로는 자세·졸음·휴대폰 판정이 전부 마지막 프레임에 얼어붙는다.
    // 이 함수는 매 렌더 불리므로(아래 효과) 회복될 때까지 재생을 다시 시도하게 된다.
    if (el.paused || el.readyState < 2) {
      el.play().catch(() => {
        /* 사용자 제스처 없이 재생이 막히는 경우 무시 */
      });
    }
  }

  /**
   * <video>에 붙이는 콜백 ref.
   * 요소가 새로 마운트될 때마다 현재 스트림을 다시 연결한다.
   * 화면 전환(그리드 <-> 코칭)으로 요소가 교체돼도 영상이 끊기지 않는다.
   */
  const attachVideo = useCallback((el: HTMLVideoElement | null) => {
    videoRef.current = el;
    bind(el, streamRef.current);
  }, []);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let cancelled = false;

    async function start() {
      setStatus('connecting');
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { width: 1280, height: 720 },
          // TODO: WebRTC 연동 시 audio: true 로 변경할 것.
          // 현재 오디오 트랙이 없어서 setAudioEnabled 가 동작하지 않고,
          // 컨트롤 바의 마이크 토글은 UI 상태만 바뀐다.
          audio: false,
        });

        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        streamRef.current = stream;
        bind(videoRef.current, stream);
        setStatus('connected');
      } catch {
        if (!cancelled) setStatus('denied');
      }
    }

    start();

    return () => {
      cancelled = true;
      streamRef.current = null;
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [attempt]);

  // 렌더마다 요소와 스트림을 다시 맞춰준다.
  // ref 콜백과 getUserMedia 완료 순서가 어긋나도 영상이 붙는다.
  // (의도적으로 의존성 배열 없음 — 이미 연결돼 있으면 아무것도 하지 않는다)
  useEffect(() => {
    bind(videoRef.current, streamRef.current);
  });

  /** 카메라 트랙 on/off — 요소를 언마운트하지 않는다 */
  const setVideoEnabled = useCallback((enabled: boolean) => {
    streamRef.current?.getVideoTracks().forEach((track) => {
      track.enabled = enabled;
    });
  }, []);

  const setAudioEnabled = useCallback((enabled: boolean) => {
    streamRef.current?.getAudioTracks().forEach((track) => {
      track.enabled = enabled;
    });
  }, []);

  const restart = useCallback(() => {
    setAttempt((n) => n + 1);
  }, []);

  return {
    /** 훅에서 요소를 읽을 때 사용 (usePostureDetection 등) */
    videoRef,
    /** JSX에서 <video ref={attachVideo} /> 로 사용 */
    attachVideo,
    status,
    restart,
    setVideoEnabled,
    setAudioEnabled,
  };
}
