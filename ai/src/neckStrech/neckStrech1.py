# 목 스트레칭 ① 옆으로 기울이기(귀→어깨) 인식·카운트(웹캠)
import time
from collections import deque

import cv2
import mediapipe as mp
import numpy as np

CALIB_SECONDS = 3.0     # 정면 기준 각도 측정 시간
TILT_TARGET_DEG = 18.0  # 이 각도 이상 기울이면 "수행 중" (목표 각도)
RETURN_DEG = 8.0        # 이 각도 미만으로 돌아와야 "복귀" 인정 (히스테리시스)
HOLD_SECONDS = 5.0      # 목표 각도 유지 시간 (실서비스는 10~30초, 테스트용 3초)
SMOOTH_FRAMES = 5       # 각도 이동평균 프레임 수

# FaceMesh 랜드마크: 양 눈 바깥 꼬리
RIGHT_EYE_OUTER = 33    # 화면 왼쪽(사용자 오른눈)
LEFT_EYE_OUTER = 263    # 화면 오른쪽(사용자 왼눈)


def head_roll_deg(lm, w: int, h: int) -> float:
    """양 눈 바깥 꼬리 선의 수평 대비 기울기(도). 왼쪽으로 기울이면 음수."""
    p1 = np.array([lm[RIGHT_EYE_OUTER].x * w, lm[RIGHT_EYE_OUTER].y * h])
    p2 = np.array([lm[LEFT_EYE_OUTER].x * w, lm[LEFT_EYE_OUTER].y * h])
    dx, dy = p2 - p1
    return float(np.degrees(np.arctan2(dy, dx)))


def main() -> None:
    face_mesh = mp.solutions.face_mesh.FaceMesh(
        max_num_faces=1,
        refine_landmarks=False,
        min_detection_confidence=0.5,
        min_tracking_confidence=0.5,
    )

    cap = cv2.VideoCapture(0)
    if not cap.isOpened():
        print("웹캠을 열 수 없습니다. 다른 앱이 카메라를 쓰고 있는지 확인하세요.")
        return

    # 캘리브레이션
    calib_start = None
    calib_samples: list[float] = []
    baseline = None  # 정면일 때의 roll 각도 (카메라 기울기 포함)

    roll_window: deque[float] = deque(maxlen=SMOOTH_FRAMES)

    # 상태머신: NEUTRAL(정면) / TILTING(기울이는 중)
    state = "NEUTRAL"
    tilt_side = None          # 'LEFT' | 'RIGHT'
    hold_start = None         # 목표 각도 도달 시각
    need_return = False       # 카운트 후 복귀 대기
    count = {"LEFT": 0, "RIGHT": 0}
    prev_time = time.time()

    print("목 옆 기울이기 테스트 — 처음 3초간 정면을 봐주세요(기준선 측정). 종료: q, 재측정: r")
    while True:
        ok, frame = cap.read()
        if not ok:
            break
        frame = cv2.flip(frame, 1)  # 거울 모드 (화면 왼쪽 = 내 왼쪽)
        h, w = frame.shape[:2]

        results = face_mesh.process(cv2.cvtColor(frame, cv2.COLOR_BGR2RGB))
        now = time.time()

        status_lines = []
        if results.multi_face_landmarks:
            lm = results.multi_face_landmarks[0].landmark
            roll_window.append(head_roll_deg(lm, w, h))
            roll = float(np.mean(roll_window))

            # ── 캘리브레이션 ──
            if baseline is None:
                calib_start = calib_start or now
                calib_samples.append(roll)
                remain = CALIB_SECONDS - (now - calib_start)
                if remain <= 0:
                    baseline = float(np.median(calib_samples))
                    print(f"기준선 측정 완료: baseline={baseline:.1f}deg")
                else:
                    status_lines.append(
                        (f"CALIBRATING... look straight ({remain:.1f}s)", (255, 200, 0)))

            if baseline is not None:
                dev = roll - baseline                     # 기준선 대비 편차
                side = "LEFT" if dev < 0 else "RIGHT"     # 거울 모드 기준
                mag = abs(dev)
                completion = min(mag / TILT_TARGET_DEG, 1.0) * 100

                # ── 상태머신 ──
                if need_return:
                    # 카운트 직후: 정면 복귀해야 다음 회 인정
                    if mag < RETURN_DEG:
                        need_return = False
                        state = "NEUTRAL"
                elif mag >= TILT_TARGET_DEG:
                    if state != "TILTING" or side != tilt_side:
                        state, tilt_side, hold_start = "TILTING", side, now
                    held = now - hold_start
                    if held >= HOLD_SECONDS:
                        count[side] += 1
                        need_return = True
                        print(f"{side} 완료! (L{count['LEFT']} / R{count['RIGHT']})")
                else:
                    state, tilt_side, hold_start = "NEUTRAL", None, None

                # ── 표시 ──
                if need_return:
                    color = (255, 200, 0)
                    status_lines.append(("OK! return to center...", color))
                elif state == "TILTING":
                    held = now - hold_start
                    color = (0, 200, 0)
                    status_lines.append(
                        (f"HOLD {tilt_side}  {held:.1f}/{HOLD_SECONDS:.0f}s", color))
                else:
                    color = (200, 200, 200)
                    status_lines.append(("tilt your head to a shoulder", color))

                status_lines.append(
                    (f"angle {dev:+.1f}deg (target {TILT_TARGET_DEG:.0f}) | done {completion:.0f}%",
                     color))
                status_lines.append(
                    (f"count  LEFT {count['LEFT']}  |  RIGHT {count['RIGHT']}", (0, 200, 0)))

                # 완성도 진행바
                bar_w = int(w * 0.4)
                filled = int(bar_w * completion / 100)
                cv2.rectangle(frame, (10, h - 40), (10 + bar_w, h - 20), (80, 80, 80), 1)
                cv2.rectangle(frame, (10, h - 40), (10 + filled, h - 20), color, -1)
        else:
            status_lines.append(("face not found...", (0, 165, 255)))

        fps = 1.0 / (now - prev_time) if now > prev_time else 0.0
        prev_time = now
        status_lines.append((f"FPS {fps:.1f} | r: recalibrate", (200, 200, 200)))

        for i, (text, color) in enumerate(status_lines):
            cv2.putText(frame, text, (10, 30 + i * 28),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.7, color, 2)

        cv2.imshow("Neck Stretch 1: Lateral Tilt (q: quit)", frame)
        key = cv2.waitKey(1) & 0xFF
        if key == ord("q"):
            break
        if key == ord("r"):
            baseline = None
            calib_start = None
            calib_samples = []
            roll_window.clear()
            state, tilt_side, hold_start, need_return = "NEUTRAL", None, None, False
            print("기준선 재측정 — 정면을 봐주세요.")

    cap.release()
    cv2.destroyAllWindows()
    face_mesh.close()


if __name__ == "__main__":
    main()
