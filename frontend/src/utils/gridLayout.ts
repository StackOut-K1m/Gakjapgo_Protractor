// src/utils/gridLayout.ts

export interface GridLayout {
  /** 한 줄에 들어가는 타일 수. 실제 격자는 이 값의 2배를 단위 열로 쓴다(getTilePlacements 참고). */
  columns: number;
  rows: number;
  /** 각 행에 놓을 타일 수. 합은 타일 개수와 같다. */
  rowSizes: number[];
}

/** 타일 하나가 격자에서 차지할 자리. 단위 열·행 모두 1부터 센다. */
export interface TilePlacement {
  columnStart: number;
  row: number;
}

/** 타일 하나가 차지하는 단위 열 수. 덜 찬 줄을 반 칸 밀어 가운데 두려고 2로 쪼갠다. */
export const UNITS_PER_TILE = 2;

/**
 * 한 화면에 놓는 타일 수의 상한.
 *
 * 예전에는 3열·4열까지 늘려 인원을 모두 한 화면에 담았는데, 그러면 타일이 작아져서
 * 자세 신호등·이름표 같은 오버레이가 영상을 거의 다 덮었다. 실시간 자세를 확인하려고
 * 켜 둔 화면인데 정작 자세가 안 보였다. 넘치는 인원은 페이지를 넘겨 본다(VideoGrid).
 */
export const MAX_TILES_PER_PAGE = 4;

/**
 * 타일 개수에 맞는 격자 크기를 돌려준다. 가로는 최대 2열이다.
 *
 * 타일은 항상 같은 크기·같은 비율(16:9)이고, 남는 공간은 여백으로 둔다.
 * 예전에는 타일이 영역을 꽉 채우도록 늘어나서 인원수에 따라 프레임이 찌그러졌다.
 *
 *  1 → 1개
 *  2 → 좌/우
 *  3 → 위 좌/우, 아래 하나(가운데)
 *  4 → 2x2
 *
 * 4개를 넘는 입력은 4로 자른다. 그 이상은 격자를 키우는 대신 페이지를 나눈다.
 */
export function getGridLayout(tileCount: number): GridLayout {
  const count = Math.min(MAX_TILES_PER_PAGE, Math.max(1, tileCount));
  const { columns, rows } = getGridShape(count);

  return { columns, rows, rowSizes: getRowSizes(count, columns, rows) };
}

function getGridShape(count: number): { columns: number; rows: number } {
  if (count <= 1) return { columns: 1, rows: 1 };
  if (count === 2) return { columns: 2, rows: 1 };
  return { columns: 2, rows: 2 };
}

/**
 * 타일을 행마다 몇 개씩 나눌지 정한다.
 *
 * 딱 나눠떨어지지 않으면 남는 타일을 위쪽 줄에 얹는다. 3명이면 위 2·아래 1,
 * 7명이면 3·2·2 다. 아래쪽을 채우고 위를 비우면 화면이 가라앉아 보인다.
 */
function getRowSizes(count: number, columns: number, rows: number): number[] {
  const base = Math.floor(count / rows);
  const extra = count % rows;
  return Array.from({ length: rows }, (_, i) =>
    Math.min(columns, base + (i < extra ? 1 : 0)),
  );
}

/**
 * 각 타일이 격자에서 앉을 자리를 순서대로 돌려준다.
 *
 * 덜 찬 줄은 가운데로 민다. 타일 하나가 단위 열 2개를 차지하므로 (columns - 줄의 타일 수)
 * 만큼 밀면 좌우 여백이 정확히 같아진다. 3명일 때 위 타일이 가운데 오는 것도 이 계산이다.
 */
export function getTilePlacements(layout: GridLayout): TilePlacement[] {
  const placements: TilePlacement[] = [];

  layout.rowSizes.forEach((size, rowIndex) => {
    const offset = layout.columns - size;
    for (let i = 0; i < size; i += 1) {
      placements.push({
        columnStart: offset + i * UNITS_PER_TILE + 1,
        row: rowIndex + 1,
      });
    }
  });

  return placements;
}
