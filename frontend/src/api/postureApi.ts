import { api } from '@/api/client';
import type {
  PostureBaseline,
  PostureDetectorInfo,
  PostureFeatures,
  PostureFrameResponse,
  PosturePreviewResponse,
} from '@/types/posture';

/**
 * 기준선 없는 한 프레임 판정. 입장 준비화면에서 "지금 자세가 나쁜지"를 물을 때 쓴다.
 *
 * 세션도 캘리브레이션도 필요 없다. 서버는 저장하지 않고 관찰 구간도 거치지 않으며,
 * 이탈 각도는 기준선이 있어야 만들 수 있어 내려주지 않는다(severity 만 본다).
 *
 * 학습된 모델이 기준선을 쓰지 않기 때문에 가능한 경로다. 규칙 기반 판정기를 지정하면
 * NO_BASELINE 보류로 답한다 — 그쪽은 기준선 대비로만 판정하는 방식이다.
 */
export async function previewPostureFrame(
  features: PostureFeatures,
): Promise<PosturePreviewResponse> {
  const { data } = await api.post<PosturePreviewResponse>(
    '/posture-frames/preview',
    { features, detector: null },
  );
  return data;
}

/**
 * 자세 프레임 판정. 브라우저가 1초에 한 번 피처 벡터를 보내면 서버가 3종을 판정하고,
 * 지속이 확인된 자세만 이벤트로 남긴다.
 *
 * sessionId 는 스터디룸 입장 시 발급되는 studyRecordId 다. 회원 id 는 보내지 않는다 —
 * 세션에 이미 회원이 붙어 있어서 서버가 찾는다.
 *
 * detector 는 판정 방식을 비교할 때만 쓴다. 비우면 서버 기본값으로 판정한다.
 * 모르는 키를 보내면 기본값으로 넘어가지 않고 400 이다 — 오타 하나로 실험 내내
 * 엉뚱한 판정기가 도는 것을 막으려는 것이다.
 */
export async function sendPostureFrame(
  sessionId: number,
  features: PostureFeatures,
  detector?: string | null,
): Promise<PostureFrameResponse> {
  const { data } = await api.post<PostureFrameResponse>(
    `/study-sessions/${sessionId}/posture-frames`,
    { features, detector: detector ?? null },
  );
  return data;
}

/**
 * 브라우저가 확정한 자세 이벤트를 그대로 저장한다(서버 판정 없음).
 *
 * <p>턱 괴기가 이 입구를 쓴다. 손목·팔꿈치 좌표가 PostureFeatures v1 에 없어서 서버가 판정할 수
 * 없기 때문이다. 한 번 괸 것이 끝났을 때 한 건 보내므로, 저장되는 행 수 = 괸 횟수다.
 */
export async function sendPostureCheck(
  sessionId: number,
  body: {
    detail: string;
    bodyPart: string;
    startedAt: string;
    endedAt: string;
    durationSeconds: number;
    severity?: number;
    alertChannel?: string;
  },
): Promise<void> {
  await api.post(`/study-sessions/${sessionId}/posture-checks`, {
    eventType: 'POSTURE',
    ...body,
  });
}

/**
 * 서버가 지원하는 판정 방식 목록. 세션과 무관해서 경로도 분리돼 있다.
 *
 * 설명 문구까지 서버가 내려주므로 화면은 받은 목록을 그리기만 하면 된다.
 * 새 판정 방식이 추가돼도 프론트엔드는 고치지 않는다.
 */
export async function getPostureDetectors(): Promise<PostureDetectorInfo[]> {
  const { data } = await api.get<PostureDetectorInfo[]>('/posture-detectors');
  return data;
}

/**
 * 바른 자세 기준선 등록. 회원당 1건이라 다시 보내면 덮어쓴다.
 *
 * 기준선이 없으면 posture-frames 가 매 요청 404 를 내므로, 판정을 시작하기 전에
 * 반드시 한 번은 성공해야 한다.
 *
 * 회원 id 는 보내지 않는다 — 서버가 액세스 토큰에서 꺼낸다.
 */
export async function saveCalibration(
  baseline: PostureBaseline,
  confidence = 90,
): Promise<void> {
  await api.post('/members/me/calibration', {
    baseline,
    confidence,
    captureUrl: null,
  });
}

/** 저장된 기준선 조회. 없으면 404 를 던진다. */
export async function getCalibration(): Promise<{ baseline: PostureBaseline }> {
  const { data } = await api.get<{ baseline: PostureBaseline }>(
    '/members/me/calibration',
  );
  return data;
}
