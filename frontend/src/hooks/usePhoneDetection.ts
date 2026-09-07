// 휴대폰 감지 훅 (FR-AI-04).
//
// ai/src/phone_detect_webcam.py 에서 검증한 YOLO11s 모델을 ONNX 로 변환해 브라우저에서 그대로 사용한다.
// (COCO-SSD 는 손에 든 폰·반사되는 케이스를 잘 못 잡아 교체했다)
//
// 성능 고려:
//   - 매 프레임 추론하면 무거우므로 INTERVAL_MS 간격으로만 실행한다.
//   - 연속 CONFIRM_COUNT 회 감지돼야 "확정"으로 보고 경고를 띄운다 (한 프레임 오탐 무시).
//   - 확정 후 COOLDOWN_MS 동안은 같은 사용에 대해 다시 알리지 않는다.
//
// ⚠ 이 추론은 메인 스레드를 멈춘다.
// onnxruntime-web 을 wasm·단일 스레드로 돌리므로(yoloPhoneDetector.ts 참고) detectPhones 는
// await 로 감싸여 있어도 워커가 아니라 같은 스레드에서 동기 실행된다. 즉 추론이 끝날 때까지
// 키 입력·렌더가 전부 대기한다. 36MB FP32 YOLO11s 를 640x640 으로 돌리는 비용이라
// 한 번에 수백 ms 가 걸리고, 주기를 짧게 두면 채팅 입력이 눈에 띄게 버벅인다.
// 근본 해결은 Web Worker 로 옮기거나 더 작은 모델(YOLO11n·양자화)로 바꾸는 것이다.
import { useCallback, useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';

import { sendPhoneCheck } from '@/api/studyRecordApi';
import { detectPhones, loadPhoneModel } from '@/lib/vision/yoloPhoneDetector';
import type { PhoneUseEvent } from '@/types/studyRecord';
import { toLocalDateTimeString } from '@/utils/datetime';

// 파이썬 검증값과 동일 계열(0.75)보다 약간 낮춰 웹캠 화질 저하를 보정한다.
const CONF_THRESHOLD = 0.4;
// 추론 주기. 다음 추론은 이전 추론이 끝난 뒤부터 이만큼 쉬고 시작한다(실제 간격 = 추론시간 + 이 값).
// 700 이었을 때는 쉬는 시간이 추론 시간보다 짧아 메인 스레드가 절반 이상 멈춰 있었다.
// 휴대폰은 오래 들고 보는 대상이라 늦게 잡아도 되므로, 입력 반응성을 택했다.
const INTERVAL_MS = 2000;
const CONFIRM_COUNT = 2; // 연속 감지 횟수
const COOLDOWN_MS = 15000; // 경고 재발동 최소 간격
// 폰이 사라진 뒤 경고를 내리기까지. 미감지 두 주기쯤 버텨야 한 번 놓친 것으로 배너가 깜빡이지 않는다.
// INTERVAL_MS 를 바꾸면 이 값도 같이 봐야 한다.
const CLEAR_MS = 6000;

/** 감지된 휴대폰의 위치 (영상 원본 좌표 기준) */
export interface PhoneBox {
  x: number;
  y: number;
  width: number;
  height: number;
  /** 영상 원본 크기 — 화면 좌표로 변환할 때 필요 */
  videoWidth: number;
  videoHeight: number;
}

export interface PhoneDetectionState {
  /** 모델 로딩 중 */
  loading: boolean;
  /** 현재 휴대폰이 감지된 상태 (경고 표시용) */
  phoneVisible: boolean;
  /** 누적 감지 횟수 */
  detectCount: number;
  /** 마지막 감지 신뢰도 */
  lastScore: number;
  /** 확인용 — 감지된 휴대폰 위치. 감지되지 않으면 null */
  box: PhoneBox | null;
  /**
   * 진행 중인 사용 구간을 지금 닫아 서버로 보낸다. 진행 중인 구간이 없으면 아무것도 하지 않는다.
   *
   * 세션 종료 직전에 <b>await 해서</b> 호출할 것. 닫힌 구간은 그때그때 저장되지만 나가는
   * 순간까지 보고 있던 구간은 아직 안 보냈기 때문에 그냥 두면 빠진다.
   */
  flushNow: () => Promise<void>;
  /**
   * 진행 중인 구간을 닫아 <b>보내지 않고</b> 돌려준다. 창 닫힘 대비 전송 전용이다.
   * (졸음 훅의 takePending 과 같은 이유 — useSessionUnloadFlush 참고)
   */
  takePending: () => PhoneUseEvent | null;
}

export function usePhoneDetection(
  videoRef: RefObject<HTMLVideoElement | null>,
  enabled: boolean,
  /** 이벤트를 기록할 세션. null 이면 판정만 하고 서버에는 보내지 않는다 */
  sessionId: number | null = null,
): PhoneDetectionState {
  const [loading, setLoading] = useState(true);
  const [phoneVisible, setPhoneVisible] = useState(false);
  const [detectCount, setDetectCount] = useState(0);
  const [lastScore, setLastScore] = useState(0);
  const [box, setBox] = useState<PhoneBox | null>(null);

  const consecutive = useRef(0);
  // -Infinity 로 시작해야 첫 감지가 쿨다운에 걸리지 않는다.
  // (스터디룸은 새 창으로 열려 performance.now() 가 0 부터 시작한다)
  const lastAlertAt = useRef(-Infinity);
  const lastSeenAt = useRef(0);
  // setState 는 비동기라 감지 루프 안에서 최신 상태를 읽기 위해 ref 를 병행한다
  const phoneVisibleRef = useRef(false);
  // 로그 도배 방지용 (마지막 진단 로그 시각)
  const lastDiagAt = useRef(0);

  // 렌더 중에 ref 를 건드리면 안 되므로 갱신은 효과에서 한다(턱 괴기 훅과 같은 방식).
  // 자정을 넘겨 기록이 갈리면 이 값이 새 id 로 바뀐다 — 전송 시점의 최신 값을 읽어야 한다.
  const sessionIdRef = useRef(sessionId);
  useEffect(() => {
    sessionIdRef.current = sessionId;
  }, [sessionId]);

  /**
   * 진행 중인 사용 구간의 시작 시각. 감지 루프와 종료 경로 양쪽에서 닫으므로 ref 로 둔다.
   *
   * performance.now() 는 창이 열린 뒤의 경과 시간이라 이벤트 시각으로 쓸 수 없다.
   * 판정은 그대로 performance.now() 로 하고, 기록용 벽시계 시각을 따로 남긴다.
   */
  const episodeStartedAt = useRef<Date | null>(null);
  /** 마지막으로 폰이 보인 벽시계 시각. 구간의 끝은 확정 시점이 아니라 이 시각이다 */
  const lastSeenWallAt = useRef(0);

  /**
   * 진행 중인 사용 구간을 이벤트로 확정한다. 진행 중인 구간이 없으면 null.
   *
   * 만들기만 하고 보내지 않는다 — 보내는 경로가 둘이라서다(감지 루프는 axios, 창 닫힘은
   * fetch keepalive). 시작 시각을 <b>먼저</b> 비우므로 두 경로가 같이 불려도 한쪽만 값을 얻는다.
   * 이 순서가 뒤바뀌면 같은 구간이 두 번 저장된다.
   */
  const closeEpisode = useCallback((endedAtMs: number): PhoneUseEvent | null => {
    const startedAt = episodeStartedAt.current;
    if (startedAt === null) return null;
    episodeStartedAt.current = null;

    // 종료가 시작보다 앞서면 서버가 400 으로 막는다(events 의 started_at <= ended_at 제약).
    const endedAt = new Date(Math.max(endedAtMs, startedAt.getTime()));
    const durationSeconds = Math.max(
      1,
      Math.round((endedAt.getTime() - startedAt.getTime()) / 1000),
    );
    if (import.meta.env.DEV) {
      console.info(`[phone] 📱 구간 종료 — ${durationSeconds}초`);
    }
    return {
      startedAt: toLocalDateTimeString(startedAt),
      endedAt: toLocalDateTimeString(endedAt),
      durationSeconds,
    };
  }, []);

  /** 구간을 닫고 바로 서버에 보낸다. 감지 루프와 세션 종료가 쓴다. */
  const closeAndSend = useCallback(
    (endedAtMs: number): Promise<void> => {
      const event = closeEpisode(endedAtMs);
      if (event === null) return Promise.resolve();
      const id = sessionIdRef.current;
      if (id === null) {
        // 세션 없이 방을 열어 본 경우(개발용 경로). 판정은 되지만 남길 곳이 없다.
        if (import.meta.env.DEV) {
          console.warn('[phone] 세션 id 가 없어 저장을 건너뜁니다', event);
        }
        return Promise.resolve();
      }
      return sendPhoneCheck(id, event)
        .then(() => {
          if (import.meta.env.DEV) {
            console.info(
              `[phone] ⬆️ 저장 완료 — ${event.durationSeconds}초 @ ${event.startedAt} (세션 ${id})`,
            );
          }
        })
        .catch((e) => {
          // 기록을 못 남겨도 공부는 이어져야 한다. 배너는 이미 떴다.
          console.warn('[phone] 이벤트를 저장하지 못했습니다', e);
        });
    },
    [closeEpisode],
  );

  const flushNow = useCallback(() => closeAndSend(Date.now()), [closeAndSend]);

  const takePending = useCallback(
    () => closeEpisode(Date.now()),
    [closeEpisode],
  );

  // 카메라가 꺼지면 경고를 내린다 (감지 루프와 분리해 effect 내 즉시 setState 를 피함)
  useEffect(() => {
    if (enabled) return;
    consecutive.current = 0;
    phoneVisibleRef.current = false;
    // 카메라가 꺼진 뒤로는 폰을 볼 수 없으니, 열려 있던 구간은 마지막으로 본 시점에서 끊는다.
    void closeAndSend(lastSeenWallAt.current);
    const id = setTimeout(() => {
      setPhoneVisible(false);
      setBox(null);
    }, 0);
    return () => clearTimeout(id);
  }, [enabled, closeAndSend]);

  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;
    let timer: number | undefined;

    (async () => {
      try {
        await loadPhoneModel();
        // 배포 환경에서도 준비 시점을 확인할 수 있어야 하므로 개발 모드 조건 없이 남긴다
        console.info('[phone] 휴대폰 감지 모델 준비 완료 (YOLO11s)');
      } catch (e) {
        console.error('[phone] YOLO 모델 로드 실패', e);
        if (!cancelled) setLoading(false);
        return;
      }
      if (cancelled) return;
      setLoading(false);

      async function tick() {
        if (cancelled) return;
        const video = videoRef.current;

        if (!video || video.readyState < 2 || video.videoWidth === 0) {
          // 영상이 준비되지 않은 이유를 3초마다 한 번 알린다
          const now = performance.now();
          if (import.meta.env.DEV && now - lastDiagAt.current > 3000) {
            lastDiagAt.current = now;
            console.warn(
              video
                ? `[phone] 영상 준비 안 됨 readyState=${video.readyState} size=${video.videoWidth}x${video.videoHeight} srcObject=${!!video.srcObject}`
                : '[phone] video 엘리먼트를 찾지 못했습니다',
            );
          }
          if (!cancelled) timer = window.setTimeout(tick, INTERVAL_MS);
          return;
        }

        try {
          const dets = await detectPhones(video, CONF_THRESHOLD);
          const best = dets[0]; // 신뢰도 내림차순 정렬됨

          if (import.meta.env.DEV) {
            const now = performance.now();
            if (best || now - lastDiagAt.current > 3000) {
              lastDiagAt.current = now;
              console.info(
                '[phone]',
                best
                  ? `📱 감지 ${best.score.toFixed(2)} (기준 ${CONF_THRESHOLD})`
                  : `폰 없음 (기준 ${CONF_THRESHOLD})`,
              );
            }
          }

          if (best) {
            consecutive.current += 1;
            lastSeenAt.current = performance.now();
            lastSeenWallAt.current = Date.now();
            setLastScore(best.score);
            // 확인용 박스 — 감지되는 즉시 표시한다(연속 확정 조건과 무관)
            const [bx, by, bw, bh] = best.bbox;
            setBox({
              x: bx,
              y: by,
              width: bw,
              height: bh,
              videoWidth: video.videoWidth,
              videoHeight: video.videoHeight,
            });

            if (
              consecutive.current >= CONFIRM_COUNT &&
              !phoneVisibleRef.current
            ) {
              const now = performance.now();
              if (now - lastAlertAt.current >= COOLDOWN_MS) {
                lastAlertAt.current = now;
                phoneVisibleRef.current = true;
                setPhoneVisible(true);
                setDetectCount((c) => c + 1);
                // 확정된 지금이 아니라 처음 보인 때를 시작으로 잡는다. 확정에는 연속 감지
                // CONFIRM_COUNT 회가 필요해 그만큼(주기 × 회수) 늦고, 그대로 두면 기록된
                // 사용 시간이 실제보다 항상 짧아진다.
                episodeStartedAt.current ??= new Date(
                  Date.now() - INTERVAL_MS * (CONFIRM_COUNT - 1),
                );
              }
            }
          } else {
            consecutive.current = 0;
            setBox(null); // 안 보이면 박스도 즉시 지운다
            if (
              phoneVisibleRef.current &&
              performance.now() - lastSeenAt.current > CLEAR_MS
            ) {
              phoneVisibleRef.current = false;
              setPhoneVisible(false);
              // 폰이 없어진 건 CLEAR_MS 를 기다린 지금이 아니라 마지막으로 보인 때다.
              void closeAndSend(lastSeenWallAt.current);
            }
          }
        } catch (e) {
          if (import.meta.env.DEV) console.warn('[phone] 추론 실패', e);
        }

        if (!cancelled) timer = window.setTimeout(tick, INTERVAL_MS);
      }

      tick();
    })();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [enabled, videoRef, closeAndSend]);

  return {
    loading,
    phoneVisible,
    detectCount,
    lastScore,
    box,
    flushNow,
    takePending,
  };
}
