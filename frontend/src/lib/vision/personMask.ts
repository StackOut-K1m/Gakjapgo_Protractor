// src/lib/vision/personMask.ts
//
// 세그멘테이션 마스크에서 '나'만 남긴다.
//
// selfie segmenter 는 "가장 앞에 있는 사람"이 아니라 화면 속 사람을 전부 사람으로 잡는다.
// 그래서 뒤로 누가 지나가면 그 사람도 마스크에 들어와 선명하게 남고, 배경 흐리기가 그 순간
// 깨진 것처럼 보인다. 여기서 마스크를 덩어리(연결 요소)로 나눈 뒤 내 것만 골라낸다.
//
// 어느 덩어리가 나인지는 밖에서 포즈 랜드마크로 찍어 준다. 자세 판정용 PoseLandmarker 가
// numPoses: 1 로 돌아서 애초에 나 하나만 추적하기 때문에, 그 점이 얹힌 덩어리가 곧 나다.
// 랜드마크를 못 받는 동안(스트레칭 중 등)에는 가장 큰 덩어리를 나로 본다 — 카메라에 가장
// 가까운 사람이 가장 크게 잡히므로 대개 맞다.

/** 마스크에서 '나'를 가리키는 점. 0~1 로 정규화된 좌표다 */
export interface MaskAnchor {
  x: number;
  y: number;
}

/**
 * 이보다 작은 덩어리는 아예 무시한다. 전체 화소 대비 비율.
 *
 * 세그멘테이션은 머리카락 끝이나 의자 모서리에 몇 화소짜리 조각을 자주 만든다. 그런 조각에
 * 랜드마크가 우연히 얹히면 그 조각만 남기고 몸 전체를 흐리게 만들어 버린다.
 */
const MIN_BLOB_RATIO = 0.005;

/**
 * 시간 평활 계수 (0~1). 1 이면 평활하지 않는다.
 *
 * 마스크는 프레임마다 조금씩 흔들려서, 그대로 쓰면 경계가 잘게 떨린다. 이전 프레임 값과
 * 섞어 그 떨림을 줄인다. 낮출수록 안정적이지만 움직일 때 잔상이 길어진다.
 */
const SMOOTHING = 0.6;

export interface PersonMaskFilter {
  /**
   * 카테고리 마스크에서 내 덩어리만 남긴 알파값을 돌려준다.
   *
   * 돌려주는 배열은 <b>내부에서 재사용</b>한다. 다음 호출 전까지만 유효하고, 보관하려면
   * 복사해야 한다. 매 프레임 수만 화소짜리 배열을 새로 만들지 않기 위해서다.
   *
   * @param values         세그멘테이션 카테고리 마스크
   * @param personCategory 사람을 가리키는 분류 값
   * @param anchors        내 위치를 찍어 주는 점들. null 이면 가장 큰 덩어리를 나로 본다
   */
  run(
    values: Uint8Array,
    width: number,
    height: number,
    personCategory: number,
    anchors: readonly MaskAnchor[] | null,
  ): Uint8ClampedArray;
  /** 시간 평활에 쓰던 이전 프레임을 버린다. 효과를 껐다 켤 때 부른다 */
  reset(): void;
}

export function createPersonMaskFilter(): PersonMaskFilter {
  let width = 0;
  let height = 0;

  /** 화소별 덩어리 번호. 0 은 배경이다 */
  let labels = new Int32Array(0);
  /** 덩어리 합치기(union-find)용 부모 배열 */
  let parent = new Int32Array(0);
  /** 덩어리별 화소 수 */
  let areas = new Int32Array(0);
  /** 남길 덩어리 표시 */
  let keep = new Uint8Array(0);
  let alpha = new Uint8ClampedArray(0);
  let previous = new Uint8ClampedArray(0);
  let hasPrevious = false;

  function resize(w: number, h: number): void {
    if (w === width && h === height) return;
    width = w;
    height = h;
    const size = w * h;
    // 8방향으로 이으면 새 번호는 아무리 많아도 화소 수의 1/4 을 넘지 않는다.
    // 절반으로 잡아 두면 넉넉하다.
    const maxLabels = Math.floor(size / 2) + 2;
    labels = new Int32Array(size);
    parent = new Int32Array(maxLabels);
    areas = new Int32Array(maxLabels);
    keep = new Uint8Array(maxLabels);
    alpha = new Uint8ClampedArray(size);
    previous = new Uint8ClampedArray(size);
    hasPrevious = false;
  }

  function find(label: number): number {
    let root = label;
    while (parent[root] !== root) root = parent[root];
    // 경로 압축 — 다음 조회부터 한 번에 뿌리에 닿는다
    let node = label;
    while (parent[node] !== root) {
      const next = parent[node];
      parent[node] = root;
      node = next;
    }
    return root;
  }

  function union(a: number, b: number): void {
    const rootA = find(a);
    const rootB = find(b);
    if (rootA === rootB) return;
    // 작은 번호를 뿌리로 삼는다. 번호 순서가 유지되어 아래 순회가 단순해진다.
    if (rootA < rootB) parent[rootB] = rootA;
    else parent[rootA] = rootB;
  }

  return {
    reset() {
      hasPrevious = false;
    },

    run(values, w, h, personCategory, anchors) {
      resize(w, h);
      const size = w * h;

      // ── 1차: 훑으면서 임시 번호를 붙이고, 이웃끼리 같은 덩어리로 묶는다 ──
      // 왼쪽·위·왼위·오른위 네 방향만 본다. 이미 지나온 화소들이라 이것만으로 8방향이 이어진다.
      let next = 1;
      for (let y = 0; y < h; y += 1) {
        for (let x = 0; x < w; x += 1) {
          const i = y * w + x;
          if (values[i] !== personCategory) {
            labels[i] = 0;
            continue;
          }

          const left = x > 0 ? labels[i - 1] : 0;
          const up = y > 0 ? labels[i - w] : 0;
          const upLeft = x > 0 && y > 0 ? labels[i - w - 1] : 0;
          const upRight = x < w - 1 && y > 0 ? labels[i - w + 1] : 0;

          let label = 0;
          if (left !== 0) label = left;
          if (up !== 0) label = label === 0 ? up : Math.min(label, up);
          if (upLeft !== 0)
            label = label === 0 ? upLeft : Math.min(label, upLeft);
          if (upRight !== 0)
            label = label === 0 ? upRight : Math.min(label, upRight);

          if (label === 0) {
            // 이웃이 모두 배경이다. 새 덩어리로 시작한다.
            if (next >= parent.length) {
              // 여기 오는 일은 없어야 한다(위 maxLabels 참고). 와도 화면이 깨지지 않게
              // 마지막 번호에 얹어 둔다.
              label = parent.length - 1;
            } else {
              label = next;
              parent[label] = label;
              next += 1;
            }
          } else {
            if (left !== 0) union(label, left);
            if (up !== 0) union(label, up);
            if (upLeft !== 0) union(label, upLeft);
            if (upRight !== 0) union(label, upRight);
          }
          labels[i] = label;
        }
      }

      // ── 2차: 임시 번호를 뿌리로 정리하고 덩어리 크기를 센다 ──
      areas.fill(0, 0, next);
      for (let i = 0; i < size; i += 1) {
        const label = labels[i];
        if (label === 0) continue;
        const root = find(label);
        labels[i] = root;
        areas[root] += 1;
      }

      // ── 3차: 남길 덩어리를 고른다 ──
      keep.fill(0, 0, next);
      const minArea = size * MIN_BLOB_RATIO;
      let chosen = false;

      if (anchors) {
        for (const anchor of anchors) {
          const x = Math.min(w - 1, Math.max(0, Math.round(anchor.x * w)));
          const y = Math.min(h - 1, Math.max(0, Math.round(anchor.y * h)));
          const root = labels[y * w + x];
          // 점이 배경에 떨어질 수 있다. 팔을 들어 몸이 둘로 나뉜 경우처럼 여러 덩어리에
          // 걸치기도 하므로, 걸린 것을 모두 남긴다.
          if (root !== 0 && areas[root] >= minArea) {
            keep[root] = 1;
            chosen = true;
          }
        }
      }

      if (!chosen) {
        // 랜드마크가 없거나 어느 덩어리에도 닿지 않았다. 가장 큰 것을 나로 본다.
        let best = 0;
        let bestArea = 0;
        for (let label = 1; label < next; label += 1) {
          if (areas[label] > bestArea) {
            bestArea = areas[label];
            best = label;
          }
        }
        if (best !== 0) keep[best] = 1;
      }

      // ── 4차: 알파로 옮기면서 이전 프레임과 섞는다 ──
      for (let i = 0; i < size; i += 1) {
        const label = labels[i];
        const on = label !== 0 && keep[label] === 1 ? 255 : 0;
        alpha[i] = hasPrevious
          ? previous[i] + (on - previous[i]) * SMOOTHING
          : on;
      }
      previous.set(alpha);
      hasPrevious = true;

      return alpha;
    },
  };
}
