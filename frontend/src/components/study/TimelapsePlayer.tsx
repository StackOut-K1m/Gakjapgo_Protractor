// src/components/study/TimelapsePlayer.tsx
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  loadTimelapse,
  type TimelapseFrame,
} from '@/lib/timelapse/frameStore';
import type { PostureLight } from '@/types/posture';
import styles from './TimelapsePlayer.module.css';

/** 재생 속도. 180장이면 15초 정도에 세션 전체가 지나간다. */
const PLAYBACK_FPS = 12;

/** 자세 막대 색. PostureLights 와 같은 값을 쓴다 — 두 화면이 다른 색이면 같은 상태로 안 읽힌다. */
const LIGHT_COLOR: Record<PostureLight, string> = {
  ok: '#22c55e',
  caution: '#ffca3a',
  danger: '#f04652',
  paused: '#9ca3af',
};

const STRIP_WIDTH = 600;
const STRIP_HEIGHT = 12;

interface Loaded {
  frames: TimelapseFrame[];
  images: HTMLImageElement[];
}

interface Props {
  /** 이 세션의 프레임을 IndexedDB 에서 찾는 키. 보통 studyRecordId. */
  sessionKey: string | null;
  /** 공부하는 동안 장면 저장에 동의한 상태였는가. 빈 화면의 이유를 가르는 데만 쓴다. */
  consented: boolean;
}

/**
 * 공부하는 동안 10초마다 담아 둔 장면을 빠르게 돌려 본다.
 *
 * 사진만 넘기면 "빨리 감은 웹캠"에 그칠 뿐이라, 아래에 세션 전체의 자세를 색 막대로 깔았다.
 * 언제 무너졌는지가 한눈에 보이고, 그 구간을 눌러 바로 그 시점으로 갈 수 있다.
 */
export default function TimelapsePlayer({ sessionKey, consented }: Props) {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [loading, setLoading] = useState(() => sessionKey !== null);
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(true);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const stripRef = useRef<HTMLCanvasElement | null>(null);

  /**
   * 저장된 세션을 읽어 곧바로 <img> 까지 만들어 둔다.
   *
   * ImageBitmap 으로 전부 디코드하면 320×180 한 장이 225KB 라 300장이면 67MB 다.
   * <img> 로 두면 디코드 캐시를 브라우저가 알아서 관리하고, 장당 15KB JPEG 이라
   * 재생 중 디코드도 1ms 미만이다.
   *
   * objectURL 생성을 이 효과 안에서 끝내야 정리도 여기서 확실히 된다. StrictMode 가
   * 효과를 두 번 돌려도 첫 번째 URL 들이 cleanup 에서 회수된다.
   */
  useEffect(() => {
    if (!sessionKey) return;
    let alive = true;
    let created: string[] = [];

    loadTimelapse(sessionKey)
      .then((session) => {
        const frames = session?.frames ?? [];
        if (!alive || frames.length === 0) {
          setLoaded({ frames: [], images: [] });
          return;
        }
        created = frames.map((f) => URL.createObjectURL(f.blob));
        const images = created.map((url) => {
          const img = new Image();
          img.src = url;
          return img;
        });
        setLoaded({ frames, images });
        setIndex(0);
        setPlaying(true);
      })
      .catch((e) => {
        // 시크릿 모드 등으로 IndexedDB 가 막혀 있을 수 있다. 안내 문구로 떨어진다.
        console.error('[timelapse] 불러오기 실패', e);
        if (alive) setLoaded({ frames: [], images: [] });
      })
      .finally(() => {
        if (alive) setLoading(false);
      });

    return () => {
      alive = false;
      created.forEach(URL.revokeObjectURL);
    };
  }, [sessionKey]);

  // `?? []` 를 그대로 쓰면 렌더마다 새 배열이라 아래 효과들이 매번 다시 걸린다.
  const frames = useMemo(() => loaded?.frames ?? [], [loaded]);
  const images = useMemo(() => loaded?.images ?? [], [loaded]);
  const atEnd = images.length > 0 && index >= images.length - 1;

  // ── 재생 ──
  // 끝에 닿으면 atEnd 가 바뀌면서 이 효과가 정리되고 다시 걸리지 않는다.
  // 여기서 setPlaying(false) 를 부르면 효과 안 동기 setState 가 되므로 그렇게 하지 않는다.
  useEffect(() => {
    if (!playing || atEnd || images.length === 0) return;
    const id = setInterval(() => {
      setIndex((prev) => Math.min(prev + 1, images.length - 1));
    }, 1000 / PLAYBACK_FPS);
    return () => clearInterval(id);
  }, [playing, atEnd, images.length]);

  // ── 현재 장면 그리기 ──
  useEffect(() => {
    const canvas = canvasRef.current;
    const img = images[index];
    if (!canvas || !img) return;
    const paint = () => {
      if (!img.naturalWidth) return;
      if (canvas.width !== img.naturalWidth) canvas.width = img.naturalWidth;
      if (canvas.height !== img.naturalHeight) canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d');
      if (ctx) ctx.drawImage(img, 0, 0);
    };
    // 아직 디코드 전이면 load 를 기다린다. 첫 장은 대개 이 경로로 들어온다.
    if (img.complete) paint();
    else img.addEventListener('load', paint, { once: true });
  }, [images, index]);

  // ── 자세 막대 ──
  useEffect(() => {
    const canvas = stripRef.current;
    if (!canvas || frames.length === 0) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, STRIP_WIDTH, STRIP_HEIGHT);

    // 장수가 막대 폭보다 많을 수 있어 칸 너비를 실수로 두고 조금씩 겹쳐 그린다.
    // 정수로 반올림하면 칸 사이에 흰 줄이 생긴다.
    const slot = STRIP_WIDTH / frames.length;
    frames.forEach((frame, i) => {
      ctx.fillStyle = LIGHT_COLOR[frame.light];
      ctx.fillRect(i * slot, 0, Math.ceil(slot) + 1, STRIP_HEIGHT);
    });

    ctx.fillStyle = '#111827';
    ctx.fillRect(Math.min(index * slot, STRIP_WIDTH - 2), 0, 2, STRIP_HEIGHT);
  }, [frames, index]);

  const seek = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (frames.length === 0) return;
      const rect = e.currentTarget.getBoundingClientRect();
      const ratio = (e.clientX - rect.left) / rect.width;
      const next = Math.round(ratio * (frames.length - 1));
      setIndex(Math.min(Math.max(next, 0), frames.length - 1));
    },
    [frames.length],
  );

  const toggle = useCallback(() => {
    // 끝까지 본 뒤 누르면 처음부터 다시.
    if (atEnd) {
      setIndex(0);
      setPlaying(true);
      return;
    }
    setPlaying((prev) => !prev);
  }, [atEnd]);

  const badRatio = useMemo(() => {
    if (frames.length === 0) return null;
    const bad = frames.filter((f) => f.light === 'danger').length;
    return Math.round((bad / frames.length) * 100);
  }, [frames]);

  if (loading) {
    return (
      <section className={styles['timelapse']} aria-label="학습 타임랩스">
        <p className={styles['title']}>🎬 오늘의 학습 타임랩스</p>
        <p className={styles['note']}>불러오는 중…</p>
      </section>
    );
  }

  if (frames.length === 0) {
    return (
      <section className={styles['timelapse']} aria-label="학습 타임랩스">
        <p className={styles['title']}>🎬 오늘의 학습 타임랩스</p>
        {consented ? (
          <p className={styles['note']}>
            이번 세션은 담긴 장면이 없어요. 카메라를 켜고 1분 이상 공부하면 10초에
            한 번씩 모아 두었다가 여기서 돌려볼 수 있어요.
          </p>
        ) : (
          <p className={styles['note']}>
            학습 장면 저장이 꺼져 있어요. 마이페이지 &gt; AI 감지 동의에서 켜면
            다음 세션부터 타임랩스를 볼 수 있어요. 사진은 내 브라우저에만
            저장돼요.
          </p>
        )}
      </section>
    );
  }

  return (
    <section className={styles['timelapse']} aria-label="학습 타임랩스">
      <p className={styles['title']}>🎬 오늘의 학습 타임랩스</p>

      {/* 경과 시간 오버레이는 뺐다 — atMillis 가 벽시계 기준이라 캡처가 멈춘 구간
          (쉬는 시간·자리 비움)까지 흘러서, 순공 시간과도 담긴 장면 분량과도 맞지 않는
          어중간한 숫자였다. */}
      <div className={styles['stage']}>
        <canvas ref={canvasRef} className={styles['screen']} />
      </div>

      <canvas
        ref={stripRef}
        className={styles['strip']}
        width={STRIP_WIDTH}
        height={STRIP_HEIGHT}
        onClick={seek}
        aria-label="자세 타임라인 — 눌러서 그 시점으로 이동"
      />

      <div className={styles['controls']}>
        <button type="button" onClick={toggle} className={styles['play-btn']}>
          {atEnd ? '↻ 다시 재생' : playing ? '❚❚ 일시정지' : '▶ 재생'}
        </button>
        <span className={styles['counter']}>
          {index + 1} / {frames.length}
        </span>
      </div>

      <p className={styles['legend']}>
        <span data-light="ok">● 바른 자세</span>
        <span data-light="caution">● 주의</span>
        <span data-light="danger">● 나쁜 자세</span>
        <span data-light="paused">● 판정 보류</span>
      </p>

      {badRatio !== null && badRatio > 0 && (
        <p className={styles['note']}>
          담긴 장면의 {badRatio}% 가 나쁜 자세였어요. 빨간 구간을 눌러 그때 모습을
          확인해보세요.
        </p>
      )}
    </section>
  );
}
