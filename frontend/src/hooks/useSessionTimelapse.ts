// src/hooks/useSessionTimelapse.ts
import { useCallback, useEffect, useRef } from 'react';
import type { RefObject } from 'react';

import { saveTimelapse, type TimelapseFrame } from '@/lib/timelapse/frameStore';
import type { PostureLight } from '@/types/posture';

/** 기본 캡처 간격. 솎아내기가 시작되면 실효 간격은 이 값의 2·4·8배로 늘어난다. */
const TICK_MILLIS = 10_000;

/**
 * 들고 있을 최대 장수.
 *
 * 이 값이 없으면 30분 공부와 4시간 공부의 재생 길이가 8배 차이 난다. 상한에 닿으면 짝수 번째만
 * 남기고 간격을 2배로 늘려서, 세션이 아무리 길어도 150~300장 사이에 머물고 전 구간이 고르게 담긴다.
 *
 *   30분 → 10초 간격 180장 / 1시간 → 20초 간격 180장 / 4시간 → 80초 간격 180장
 *
 * 장당 10~15KB 라 메모리는 4.5MB 를 넘지 않는다.
 */
const MAX_FRAMES = 300;

/** 저장 해상도. 원본을 그대로 두면 장당 수백 KB 라 금방 수십 MB 가 된다. */
const FRAME_WIDTH = 320;
const JPEG_QUALITY = 0.6;

export interface SessionTimelapse {
  /**
   * 지금까지 모은 장수. state 가 아니라 ref 다 — 10초마다 setState 하면 그때마다
   * 스터디룸 전체가 다시 그려진다.
   */
  frameCountRef: RefObject<number>;
  /** 모아 둔 프레임을 IndexedDB 로 넘긴다. 종료 처리에서 딱 한 번 부른다. */
  save: (sessionKey: string) => Promise<boolean>;
}

interface Options {
  videoRef: RefObject<HTMLVideoElement | null>;
  /**
   * 지금 찍어도 되는가.
   *
   * 카메라가 꺼졌거나 자리를 비웠거나 쉬는 시간이면 false 여야 한다. 그대로 찍으면
   * 검은 화면과 빈 의자만 잔뜩 담겨서 돌아볼 값어치가 없어진다.
   */
  enabled: boolean;
  /** 그 시점의 자세. 재생 막대 색이 된다. */
  light: PostureLight;
}

/**
 * 공부하는 동안 10초마다 웹캠을 한 장씩 담아 두었다가, 종료 화면에서 타임랩스로 돌려 본다.
 *
 * MediaPipe 루프(usePoseStream)에 얹지 않고 별도 setInterval 로 도는 이유:
 * 그 루프를 하나로 유지해야 하는 건 detectForVideo 가 단조 증가 타임스탬프를 요구하기 때문인데,
 * 여기서는 추론을 하지 않고 픽셀만 읽는다. 0.1Hz 라 부하도 사실상 없다.
 */
export function useSessionTimelapse({
  videoRef,
  enabled,
  light,
}: Options): SessionTimelapse {
  const framesRef = useRef<TimelapseFrame[]>([]);
  const frameCountRef = useRef(0);
  const startedAtRef = useRef<number | null>(null);

  /** 몇 틱마다 한 장 찍을지. 솎아낼 때마다 2배가 된다. */
  const strideRef = useRef(1);
  const tickRef = useRef(0);

  /** toBlob 이 아직 안 끝났는데 다음 틱이 오는 경우를 막는다. */
  const busyRef = useRef(false);

  const lightRef = useRef<PostureLight>(light);
  useEffect(() => {
    lightRef.current = light;
  }, [light]);

  const enabledRef = useRef(enabled);
  useEffect(() => {
    enabledRef.current = enabled;
  }, [enabled]);

  const capture = useCallback(async () => {
    const video = videoRef.current;
    // 스트레칭 중에는 <video> 가 오버레이 쪽으로 옮겨가면서 잠깐 null 이 된다.
    // HAVE_CURRENT_DATA(2) 미만이면 그려도 빈 프레임이 나온다.
    if (!video || video.readyState < 2) return;
    if (!video.videoWidth || !video.videoHeight) return;

    const height = Math.round(
      (FRAME_WIDTH * video.videoHeight) / video.videoWidth,
    );
    const canvas = document.createElement('canvas');
    canvas.width = FRAME_WIDTH;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, FRAME_WIDTH, height);

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY);
    });
    if (!blob) return;

    const startedAt = startedAtRef.current ?? Date.now();
    framesRef.current.push({
      atMillis: Date.now() - startedAt,
      light: lightRef.current,
      blob,
    });

    // 상한에 닿으면 절반으로 솎고 간격을 2배로. 남는 건 항상 균등 간격이다.
    if (framesRef.current.length >= MAX_FRAMES) {
      framesRef.current = framesRef.current.filter((_, i) => i % 2 === 0);
      strideRef.current *= 2;
    }
    frameCountRef.current = framesRef.current.length;
  }, [videoRef]);

  useEffect(() => {
    if (!enabled) return;
    if (startedAtRef.current === null) startedAtRef.current = Date.now();

    const id = setInterval(() => {
      // 카메라를 껐다 켜도 틱 위상은 그대로 둔다. 간격만 건너뛴다.
      if (!enabledRef.current || busyRef.current) return;
      tickRef.current += 1;
      if (tickRef.current % strideRef.current !== 0) return;

      busyRef.current = true;
      capture().finally(() => {
        busyRef.current = false;
      });
    }, TICK_MILLIS);

    return () => clearInterval(id);
  }, [enabled, capture]);

  const save = useCallback(async (sessionKey: string) => {
    const frames = framesRef.current;
    // 두세 장짜리는 타임랩스라고 부를 수 없다. 종료 화면에 빈 껍데기를 띄우지 않는다.
    if (frames.length < 3) return false;
    try {
      await saveTimelapse({
        sessionKey,
        savedAt: Date.now(),
        strideMillis: TICK_MILLIS * strideRef.current,
        frames,
      });
      return true;
    } catch (e) {
      // 저장에 실패해도 종료 자체는 막지 않는다. 타임랩스가 안 보일 뿐이다.
      console.error('[timelapse] 저장 실패 — 종료는 계속한다', e);
      return false;
    }
  }, []);

  return { frameCountRef, save };
}
