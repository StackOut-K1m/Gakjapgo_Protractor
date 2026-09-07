// MediaPipe PoseLandmarker 공용 인스턴스.
//
// 자세 감지·졸음 감지·스트레칭 판정이 모두 같은 랜드마커를 쓴다.
// 모델을 여러 번 만들면 GPU 메모리와 초기화 비용이 낭비되므로 하나만 만들어 공유한다.
//
// wasm/모델 파일은 public/mediapipe/ 에 둔다 (CDN 의존 없이 오프라인 동작).
// 최초 세팅: npm run setup:mediapipe
import { FilesetResolver, PoseLandmarker } from '@mediapipe/tasks-vision';

const WASM_PATH = '/mediapipe/wasm';
const MODEL_PATH = '/mediapipe/models/pose_landmarker_heavy.task';

let instance: PoseLandmarker | null = null;
let loading: Promise<PoseLandmarker> | null = null;

/** 공용 PoseLandmarker 를 가져온다 (최초 1회만 로드, 동시 호출도 1회로 합쳐짐). */
export function getPoseLandmarker(): Promise<PoseLandmarker> {
  if (instance) return Promise.resolve(instance);
  if (loading) return loading;

  loading = (async () => {
    const fileset = await FilesetResolver.forVisionTasks(WASM_PATH);
    const landmarker = await PoseLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: MODEL_PATH, delegate: 'GPU' },
      runningMode: 'VIDEO',
      numPoses: 1,
    });
    instance = landmarker;
    return landmarker;
  })();

  // 실패하면 다음 호출에서 다시 시도할 수 있도록 캐시를 비운다
  loading.catch(() => {
    loading = null;
  });
  return loading;
}

/** 페이지를 완전히 떠날 때만 호출 (스터디룸 종료 등). */
export function closePoseLandmarker(): void {
  instance?.close();
  instance = null;
  loading = null;
}
