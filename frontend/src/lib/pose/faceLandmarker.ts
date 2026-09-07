// MediaPipe FaceLandmarker 공용 인스턴스 — 졸음 감지 전용.
//
// 자세·스트레칭 판정은 PoseLandmarker(poseLandmarker.ts)를 쓴다. 눈 감김은 Pose 로 판정할 수
// 없다 — Pose 의 눈은 좌우 각 1점(2·5번)뿐이라 세로/가로 비율(EAR)을 낼 세로 폭이 없다.
// 그래서 눈 주변 6점을 주는 FaceLandmarker 를 따로 로드한다.
//
// 두 모델은 서로 다른 인스턴스라 타임스탬프가 독립이다. 즉 PoseLandmarker 처럼
// "루프는 하나만" 제약을 공유하지 않는다. 다만 GPU·메인 스레드는 함께 쓰므로
// 소비하는 쪽(useDrowsinessDetection)이 추론 주기를 낮게 잡는다.
//
// 모델 파일은 public/mediapipe/models/ 에 둔다 (npm run setup:mediapipe).
import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';

const WASM_PATH = '/mediapipe/wasm';
const MODEL_PATH = '/mediapipe/models/face_landmarker.task';

let instance: FaceLandmarker | null = null;
let loading: Promise<FaceLandmarker> | null = null;

/** 공용 FaceLandmarker 를 가져온다 (최초 1회만 로드, 동시 호출도 1회로 합쳐짐). */
export function getFaceLandmarker(): Promise<FaceLandmarker> {
  if (instance) return Promise.resolve(instance);
  if (loading) return loading;

  loading = (async () => {
    const fileset = await FilesetResolver.forVisionTasks(WASM_PATH);
    const landmarker = await FaceLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: MODEL_PATH, delegate: 'GPU' },
      runningMode: 'VIDEO',
      numFaces: 1,
      // 표정 분류·머리 회전 행렬은 쓰지 않는다. 켜면 추론만 무거워진다.
      outputFaceBlendshapes: false,
      outputFacialTransformationMatrixes: false,
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
export function closeFaceLandmarker(): void {
  instance?.close();
  instance = null;
  loading = null;
}
