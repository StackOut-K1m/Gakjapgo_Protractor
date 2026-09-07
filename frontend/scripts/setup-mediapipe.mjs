// MediaPipe 자산 준비 스크립트 — npm run setup:mediapipe
//
// wasm 런타임과 Pose 모델은 용량이 커서 git에 올리지 않는다(.gitignore).
// 클론 후 한 번 실행하면 public/mediapipe/ 아래로 내려받는다.
import { createWriteStream } from 'node:fs';
import { cp, mkdir, stat } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const wasmSrc = resolve(root, 'node_modules/@mediapipe/tasks-vision/wasm');
const wasmDest = resolve(root, 'public/mediapipe/wasm');
const modelDir = resolve(root, 'public/mediapipe/models');

// 내려받을 모델 목록. 이미 있는 파일은 건너뛴다.
const MODELS = [
  {
    // 자세·스트레칭 판정 (PoseLandmarker)
    file: 'pose_landmarker_heavy.task',
    size: '약 29MB',
    url: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_heavy/float16/1/pose_landmarker_heavy.task',
  },
  {
    // 졸음 판정 (FaceLandmarker) — Pose 의 눈은 1점뿐이라 EAR 을 낼 수 없어 별도 모델이 필요하다
    file: 'face_landmarker.task',
    size: '약 3.6MB',
    url: 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
  },
  {
    // 배경 흐리게 (ImageSegmenter) — 사람과 배경을 갈라내는 마스크를 만든다.
    // landscape 판을 쓰는 이유는 카메라가 16:9 로 들어오기 때문이다. 정사각(256x256) 판을
    // 쓰면 좌우가 눌린 채로 추론해서 어깨 바깥쪽 경계가 뭉개진다.
    file: 'selfie_segmenter_landscape.tflite',
    size: '약 250KB',
    url: 'https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter_landscape/float16/1/selfie_segmenter_landscape.tflite',
  },
];

async function exists(p) {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  if (!(await exists(wasmSrc))) {
    console.error('@mediapipe/tasks-vision 가 설치되어 있지 않습니다. 먼저 npm install 을 실행하세요.');
    process.exit(1);
  }

  await mkdir(wasmDest, { recursive: true });
  await cp(wasmSrc, wasmDest, { recursive: true });
  console.log(`wasm 복사 완료 → ${wasmDest}`);

  await mkdir(modelDir, { recursive: true });

  for (const model of MODELS) {
    const dest = resolve(modelDir, model.file);
    if (await exists(dest)) {
      console.log(`${model.file} 이미 있습니다. 건너뜁니다.`);
      continue;
    }

    console.log(`${model.file} 다운로드 중… (${model.size})`);
    const res = await fetch(model.url);
    if (!res.ok) {
      console.error(`${model.file} 다운로드 실패: HTTP ${res.status}`);
      process.exit(1);
    }
    await pipeline(Readable.fromWeb(res.body), createWriteStream(dest));
    console.log(`저장 완료 → ${dest}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

