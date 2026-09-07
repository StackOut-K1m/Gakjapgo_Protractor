// MediaPipe ImageSegmenter 공용 인스턴스 — 사람과 배경을 갈라내는 마스크를 만든다.
//
// 쓰는 곳은 배경 흐리게(화면 설정) 하나뿐이다. 그래서 자세·졸음 판정처럼 방에 들어가자마자
// 만들지 않고, 효과를 처음 켜는 순간에 만든다. 효과를 안 쓰는 사람은 모델을 받지도,
// GPU 에 올리지도 않는다.
//
// 자세용 PoseLandmarker 의 세그멘테이션 마스크를 대신 쓸 수도 있었다. 추론을 한 번 아낄 수
// 있어 솔깃하지만 그러지 않았다 — 마스크 출력은 랜드마커를 만들 때 정하는 옵션이라 켜는
// 순간부터 매 프레임 비용이 붙는데, 그 랜드마커는 자세·스트레칭·졸음이 함께 쓰는 싱글턴이라
// 배경 효과를 끈 사람까지 그 비용을 나눠 내게 된다. 자세 판정은 이 앱의 핵심이라
// 부가 기능 때문에 느려지면 안 된다.
//
// wasm/모델 파일은 public/mediapipe/ 에 둔다 (CDN 의존 없이 오프라인 동작).
// 최초 세팅: npm run setup:mediapipe
import { FilesetResolver, ImageSegmenter } from '@mediapipe/tasks-vision';

const WASM_PATH = '/mediapipe/wasm';
const MODEL_PATH = '/mediapipe/models/selfie_segmenter_landscape.tflite';

let instance: ImageSegmenter | null = null;
let loading: Promise<ImageSegmenter> | null = null;

/** 공용 ImageSegmenter 를 가져온다 (최초 1회만 로드, 동시 호출도 1회로 합쳐짐). */
export function getSelfieSegmenter(): Promise<ImageSegmenter> {
  if (instance) return Promise.resolve(instance);
  if (loading) return loading;

  loading = (async () => {
    const fileset = await FilesetResolver.forVisionTasks(WASM_PATH);
    const segmenter = await ImageSegmenter.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: MODEL_PATH, delegate: 'GPU' },
      runningMode: 'VIDEO',
      // 사람인지 아닌지만 알면 되므로 확률 마스크(Float32)는 받지 않는다.
      // 픽셀당 4바이트를 1바이트로 줄이는 셈이라 GPU→CPU 로 읽어 오는 양도 그만큼 준다.
      outputCategoryMask: true,
      outputConfidenceMasks: false,
    });
    instance = segmenter;
    return segmenter;
  })();

  // 실패하면 다음 호출에서 다시 시도할 수 있도록 캐시를 비운다
  loading.catch(() => {
    loading = null;
  });
  return loading;
}

/** 페이지를 완전히 떠날 때만 호출 (스터디룸 종료 등). */
export function closeSelfieSegmenter(): void {
  instance?.close();
  instance = null;
  loading = null;
}
