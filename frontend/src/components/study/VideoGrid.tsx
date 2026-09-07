// src/components/study/VideoGrid.tsx
import { memo, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import type { StreamManager } from 'openvidu-browser';
import type { Participant } from '@/types/room';
import type { CanvasRefCallback, VideoRefCallback } from '@/types/video';
import {
  MAX_TILES_PER_PAGE,
  UNITS_PER_TILE,
  getGridLayout,
  getTilePlacements,
} from '@/utils/gridLayout';
import ParticipantTile from './ParticipantTile';
import { ChevronLeftIcon, ChevronRightIcon } from './icons';
import styles from './VideoGrid.module.css';

interface VideoGridProps {
  participants: Participant[];
  attachSelfVideo: VideoRefCallback;
  /** 내 타일에 덮을 배경 효과 캔버스. null 이면 효과가 꺼져 있다 */
  attachEffectCanvas?: CanvasRefCallback | null;
  /** memberId → 화상 스트림. 참여자 타일에 상대 영상을 붙이는 데 쓴다. */
  remoteStreams?: Map<string, StreamManager>;
  /**
   * 내 타일 위에 얹을 것(실시간 자세 신호등 등).
   *
   * 스테이지에 얹으면 타일과 어긋난다 — 보드가 비율을 지키느라 가운데 정렬되어서
   * 창 크기에 따라 스테이지 모서리와 타일 모서리가 따로 논다. 타일 칸 안에 넣어야 붙어 다닌다.
   */
  selfOverlay?: ReactNode;
  /**
   * 내 영상이 작은 창(PiP)으로 옮겨 갔는지.
   * 로컬 &lt;video&gt; 는 한 번에 하나만 있어야 해서, 옮겨 간 동안 내 타일은 비워 둔다.
   */
  selfVideoDetached?: boolean;
}

/** 타일 한 칸의 가로세로 비율. 카메라가 1280x720 으로 들어와 여기에 맞춘다. */
const TILE_ASPECT_W = 16;
const TILE_ASPECT_H = 9;

/**
 * 한 페이지에 놓을 다른 참여자 수. 내 타일이 한 칸을 늘 차지하므로 그만큼 뺀다.
 */
const OTHERS_PER_PAGE = MAX_TILES_PER_PAGE - 1;

/**
 * 화상 타일 그리드.
 *
 * 타일은 인원수와 무관하게 늘 같은 비율이다. 격자 전체 크기를 비율에 맞춰 잡고 남는 쪽을
 * 여백으로 두는 방식이라, 셀을 늘려 채우던 예전처럼 프레임이 세로로 길어지지 않는다.
 *
 * <p>
 * <b>가로는 최대 2열, 한 화면에 4명까지다.</b> 3열·4열로 늘리면 타일이 작아져서 자세
 * 신호등·이름표가 영상을 거의 다 덮는다 — 자세를 보려고 켜 둔 화면인데 자세가 안 보인다.
 * 인원이 넘치면 격자를 키우는 대신 좌우 화살표로 페이지를 넘긴다.
 *
 * <p>
 * <b>내 타일은 모든 페이지에 고정으로 남는다.</b> 자세·졸음·휴대폰 판정이 모두 내 타일의
 * &lt;video&gt; 를 보고 있어서(attachSelfVideo), 페이지를 넘겼다고 그 요소가 사라지면
 * 판정이 조용히 멈춘다. 넘겨 볼 수 있는 것은 다른 참여자뿐이다.
 *
 * <p>
 * 부모(StudyRoomPage)는 학습 타이머 때문에 1초마다, 채팅이 오면 그때마다 다시 그려진다.
 * 그 리렌더가 여기까지 내려오면 자세 추론이 도는 메인 스레드에서 화면이 밀린다.
 * props 가 그대로면 건너뛰도록 memo 로 감싼다.
 */
function VideoGrid({
  participants,
  attachSelfVideo,
  attachEffectCanvas,
  remoteStreams,
  selfOverlay,
  selfVideoDetached = false,
}: VideoGridProps) {
  const [page, setPage] = useState(0);

  const self = participants.find((p) => p.isSelf);
  const others = participants.filter((p) => !p.isSelf);

  const totalPages = Math.max(1, Math.ceil(others.length / OTHERS_PER_PAGE));
  // 사람이 나가면 페이지 수가 줄어든다. state 를 효과로 되돌리지 않고 읽을 때 자른다 —
  // 되돌리면 렌더가 한 번 더 돌고, 그 사이 빈 화면이 스친다.
  const safePage = Math.min(page, totalPages - 1);

  const visible = [
    ...(self ? [self] : []),
    ...others.slice(
      safePage * OTHERS_PER_PAGE,
      (safePage + 1) * OTHERS_PER_PAGE,
    ),
  ];

  const layout = getGridLayout(visible.length);
  const placements = getTilePlacements(layout);

  // 격자 전체가 몇 대 몇인지. CSS 에서 var() 로 나누는 걸 피하려고 역수까지 같이 넘긴다.
  const boardAspect =
    (layout.columns * TILE_ASPECT_W) / (layout.rows * TILE_ASPECT_H);

  const gridStyle = {
    '--grid-columns': layout.columns,
    '--grid-rows': layout.rows,
    '--grid-aspect': boardAspect,
    '--grid-aspect-inverse': 1 / boardAspect,
  } as CSSProperties;

  const movePage = (delta: number) =>
    setPage((prev) =>
      Math.min(
        totalPages - 1,
        Math.max(0, Math.min(prev, totalPages - 1) + delta),
      ),
    );

  return (
    <div className={styles['grid-viewport']}>
      {totalPages > 1 && (
        <button
          type="button"
          className={styles['page-btn']}
          data-side="left"
          onClick={() => movePage(-1)}
          disabled={safePage === 0}
          aria-label="이전 참여자 보기"
        >
          <ChevronLeftIcon />
        </button>
      )}

      <div className={styles['video-grid']} style={gridStyle}>
        {visible.map((participant, index) => {
          // 배치는 타일 수에서 나오므로 자리를 못 받는 타일은 없다.
          const placement = placements[index];

          return (
            <div
              key={participant.id}
              className={styles['grid-cell']}
              style={{
                gridColumn: `${placement.columnStart} / span ${UNITS_PER_TILE}`,
                gridRow: placement.row,
              }}
            >
              <ParticipantTile
                participant={participant}
                attachVideo={participant.isSelf ? attachSelfVideo : undefined}
                attachEffectCanvas={
                  participant.isSelf ? attachEffectCanvas : null
                }
                streamManager={remoteStreams?.get(participant.id)}
                videoDetached={participant.isSelf && selfVideoDetached}
              />
              {participant.isSelf && selfOverlay}
            </div>
          );
        })}
      </div>

      {totalPages > 1 && (
        <>
          <button
            type="button"
            className={styles['page-btn']}
            data-side="right"
            onClick={() => movePage(1)}
            disabled={safePage >= totalPages - 1}
            aria-label="다음 참여자 보기"
          >
            <ChevronRightIcon />
          </button>

          {/* 몇 명이 더 있는지 모르면 화살표를 누를 이유를 알 수 없다 */}
          <p className={styles['page-indicator']} role="status">
            {safePage + 1} / {totalPages} · 참여자 {others.length}명
          </p>
        </>
      )}
    </div>
  );
}

export default memo(VideoGrid);
