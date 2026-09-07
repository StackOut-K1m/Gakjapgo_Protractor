// YOLO11s(ONNX) 휴대폰 감지기 — 파이썬에서 검증한 그 모델을 브라우저에서 그대로 사용한다.
//
// COCO-SSD 는 반사되는 물체·손에 든 폰을 잘 못 잡아서 교체했다.
// onnxruntime-web 은 후처리를 직접 해야 하므로 아래를 구현한다:
//   1) letterbox 전처리 — 원본 비율을 유지한 채 640x640 에 맞추고 남는 곳을 회색으로 채운다
//   2) 출력 파싱 — YOLO11 출력은 [1, 84, 8400] (cx,cy,w,h + 클래스 80개 점수)
//   3) NMS — 같은 물체에 겹친 박스 중 점수가 가장 높은 것만 남긴다
//   4) 좌표 역변환 — letterbox 로 옮긴 좌표를 원본 영상 좌표로 되돌린다
// wasm 전용 빌드를 쓴다 (jsep/WebGPU 로더를 찾지 않아 Vite 와 충돌하지 않는다)
import * as ort from 'onnxruntime-web/wasm';
import type { InferenceSession, Tensor } from 'onnxruntime-web';
// wasm 바이너리는 node_modules 에서 Vite 가 해석하게 한다.
// (public/ 에 두면 "소스에서 import 할 수 없다"는 Vite 오류가 난다)
import ortWasmUrl from 'onnxruntime-web/ort-wasm-simd-threaded.wasm?url';

const MODEL_URL = '/models/yolo11s.onnx';
// ⚠ 이 값은 줄일 수 없다. yolo11s.onnx 의 입력이 [1,3,640,640] 으로 고정 export 돼 있어
// (dynamic axes 아님) 다른 크기를 넣으면 sess.run 이 매번 예외를 던지고 감지가 조용히 멈춘다.
// 연산량을 줄이려면 ultralytics 에서 imgsz=320 또는 dynamic=True 로 다시 export 해야 한다.
const INPUT_SIZE = 640;
const CELL_PHONE_CLASS = 67; // COCO 클래스 67 = cell phone
const NUM_CLASSES = 80;

export interface Detection {
  /** 원본 영상 좌표 [x, y, width, height] */
  bbox: [number, number, number, number];
  score: number;
}

let session: InferenceSession | null = null;
let loading: Promise<InferenceSession> | null = null;

/** ONNX 세션을 준비한다 (최초 1회, 동시 호출은 하나로 합쳐짐) */
export function loadPhoneModel(): Promise<InferenceSession> {
  if (session) return Promise.resolve(session);
  if (loading) return loading;

  loading = (async () => {
    // Vite 가 해석한 wasm 경로를 알려준다 (CDN 의존 없음)
    ort.env.wasm.wasmPaths = { wasm: ortWasmUrl };
    // 멀티스레드 wasm 은 SharedArrayBuffer(COOP/COEP 헤더)를 요구한다.
    // 헤더 설정 없이도 동작하도록 단일 스레드로 고정한다.
    ort.env.wasm.numThreads = 1;
    const created = await ort.InferenceSession.create(MODEL_URL, {
      executionProviders: ['wasm'],
      graphOptimizationLevel: 'all',
    });
    session = created;
    return created;
  })();

  loading.catch(() => {
    loading = null;
  });
  return loading;
}

/** letterbox 변환 정보 — 좌표를 원본으로 되돌릴 때 필요 */
interface Letterbox {
  scale: number;
  padX: number;
  padY: number;
}

const canvas = document.createElement('canvas');
canvas.width = INPUT_SIZE;
canvas.height = INPUT_SIZE;
const ctx = canvas.getContext('2d', { willReadFrequently: true })!;

/** 영상 프레임을 640x640 letterbox 로 그린 뒤 NCHW Float32 텐서로 변환한다 */
function preprocess(video: HTMLVideoElement): { data: Float32Array; box: Letterbox } {
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  const scale = Math.min(INPUT_SIZE / vw, INPUT_SIZE / vh);
  const drawW = Math.round(vw * scale);
  const drawH = Math.round(vh * scale);
  const padX = Math.floor((INPUT_SIZE - drawW) / 2);
  const padY = Math.floor((INPUT_SIZE - drawH) / 2);

  ctx.fillStyle = 'rgb(114,114,114)';
  ctx.fillRect(0, 0, INPUT_SIZE, INPUT_SIZE);
  ctx.drawImage(video, padX, padY, drawW, drawH);

  const { data: rgba } = ctx.getImageData(0, 0, INPUT_SIZE, INPUT_SIZE);
  const area = INPUT_SIZE * INPUT_SIZE;
  // NCHW: 채널별로 나눠 담고 0~1 로 정규화
  const out = new Float32Array(area * 3);
  for (let i = 0; i < area; i += 1) {
    out[i] = rgba[i * 4] / 255; // R
    out[area + i] = rgba[i * 4 + 1] / 255; // G
    out[area * 2 + i] = rgba[i * 4 + 2] / 255; // B
  }
  return { data: out, box: { scale, padX, padY } };
}

/** IoU — 두 박스가 겹치는 정도 (NMS 판정용) */
function iou(a: Detection, b: Detection): number {
  const [ax, ay, aw, ah] = a.bbox;
  const [bx, by, bw, bh] = b.bbox;
  const x1 = Math.max(ax, bx);
  const y1 = Math.max(ay, by);
  const x2 = Math.min(ax + aw, bx + bw);
  const y2 = Math.min(ay + ah, by + bh);
  const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  const union = aw * ah + bw * bh - inter;
  return union > 0 ? inter / union : 0;
}

/**
 * YOLO 출력에서 휴대폰 박스만 추출한다.
 * 출력 형태는 [1, 4+80, 8400] — 앞 4개가 박스, 나머지가 클래스 점수.
 */
function parseOutput(
  output: Tensor,
  box: Letterbox,
  confThreshold: number,
  iouThreshold: number,
): Detection[] {
  const data = output.data as Float32Array;
  const dims = output.dims; // [1, 84, 8400]
  const channels = dims[1];
  const anchors = dims[2];
  if (channels !== 4 + NUM_CLASSES) {
    console.warn('[yolo] 예상과 다른 출력 형태', dims);
  }

  const found: Detection[] = [];
  const scoreOffset = (4 + CELL_PHONE_CLASS) * anchors;

  for (let i = 0; i < anchors; i += 1) {
    const score = data[scoreOffset + i];
    if (score < confThreshold) continue;

    // 중심좌표·크기 → 좌상단 기준으로 변환하고 letterbox 를 되돌린다
    const cx = data[i];
    const cy = data[anchors + i];
    const w = data[anchors * 2 + i];
    const h = data[anchors * 3 + i];

    const x = (cx - w / 2 - box.padX) / box.scale;
    const y = (cy - h / 2 - box.padY) / box.scale;
    found.push({ bbox: [x, y, w / box.scale, h / box.scale], score });
  }

  // NMS — 점수 높은 순으로 남기고 많이 겹치는 것은 버린다
  found.sort((a, b) => b.score - a.score);
  const kept: Detection[] = [];
  for (const cand of found) {
    if (kept.every((k) => iou(k, cand) < iouThreshold)) kept.push(cand);
  }
  return kept;
}

/**
 * 프레임 1장에서 휴대폰을 감지한다.
 * @returns 신뢰도 내림차순 박스 목록 (없으면 빈 배열)
 */
export async function detectPhones(
  video: HTMLVideoElement,
  confThreshold = 0.4,
  iouThreshold = 0.45,
): Promise<Detection[]> {
  const sess = await loadPhoneModel();

  const { data, box } = preprocess(video);
  const input = new ort.Tensor('float32', data, [1, 3, INPUT_SIZE, INPUT_SIZE]);
  const feeds: Record<string, Tensor> = { [sess.inputNames[0]]: input };
  const result = await sess.run(feeds);
  const output = result[sess.outputNames[0]];
  return parseOutput(output, box, confThreshold, iouThreshold);
}

/** 모델이 준비됐는지 */
export function isPhoneModelReady(): boolean {
  return session !== null;
}
