# 목 스트레칭 ③ 대각선 스트레칭(45° 돌려서 숙이기) 인식·카운트 테스트 (웹캠, MediaPipe Pose)

import time
from collections import deque

import cv2
import mediapipe as mp
import numpy as np

CALIB_SECONDS = 3.0   # 정면 기준 측정 시간
HOLD_SECONDS = 3.0    # 유지 시간 (실서비스는 stretchings.hold_seconds)
X_MIN = 0.10          # 코 가로 이동 최소치 (어깨너비 배수)
Y_MIN = 0.12          # 코 세로(아래) 이동 최소치
YAW_SHRINK = 0.85     # 귀 간격이 기준선의 이 비율 미만이면 "고개 돌림" 인정
NEUTRAL_R = 0.08      # 코가 중심에서 이 거리 안이면 "정면 복귀"
SMOOTH_FRAMES = 4
HOLD_GRACE_SECONDS = 0.8  # 유지 중 순간 끊김 허용 시간

P = mp.solutions.pose.PoseLandmark


def xy(lm, idx, w, h):
    return np.array([lm[idx].x * w, lm[idx].y * h])


def main() -> None:
    pose = mp.solutions.pose.Pose(
        model_complexity=1,
        min_detection_confidence=0.5,
        min_tracking_confidence=0.5,
    )

    cap = cv2.VideoCapture(0)
    if not cap.isOpened():
        print("웹캠을 열 수 없습니다. 다른 앱이 카메라를 쓰고 있는지 확인하세요.")
        return

    # 캘리브레이션
    calib_start = None
    calib_pos: list[np.ndarray] = []
    calib_earw: list[float] = []
    center = None      # 정면일 때 코 상대좌표 (어깨 기준)
    earw_base = None   # 정면일 때 귀 간격 / 어깨너비

    pos_window: deque[np.ndarray] = deque(maxlen=SMOOTH_FRAMES)

    # 상태머신: NEUTRAL → HOLDING(대각선 유지 중) → (카운트) → RETURN → NEUTRAL
    state = "NEUTRAL"
    hold_side = None
    hold_start = None
    cond_broken_since = None
    count = {"LEFT": 0, "RIGHT": 0}
    prev_time = time.time()

    print("대각선 스트레칭 테스트 — 처음 3초간 정면을 봐주세요. 종료: q, 재측정: r")
    while True:
        ok, frame = cap.read()
        if not ok:
            break
        frame = cv2.flip(frame, 1)  # 거울 모드 (화면 왼쪽 = 내 왼쪽)
        h, w = frame.shape[:2]

        results = pose.process(cv2.cvtColor(frame, cv2.COLOR_BGR2RGB))
        now = time.time()

        status_lines = []
        if results.pose_landmarks:
            lm = results.pose_landmarks.landmark

            nose = xy(lm, P.NOSE, w, h)
            ear_l, ear_r = xy(lm, P.LEFT_EAR, w, h), xy(lm, P.RIGHT_EAR, w, h)
            sh_l, sh_r = xy(lm, P.LEFT_SHOULDER, w, h), xy(lm, P.RIGHT_SHOULDER, w, h)
            shoulder_w = np.linalg.norm(sh_l - sh_r)
            shoulder_mid = (sh_l + sh_r) / 2
            if shoulder_w < 1:
                continue

            rel = (nose - shoulder_mid) / shoulder_w
            pos_window.append(rel)
            rel_s = np.mean(pos_window, axis=0)
            earw = float(np.linalg.norm(ear_r - ear_l) / shoulder_w)

            # ── 캘리브레이션 ──
            if center is None:
                calib_start = calib_start or now
                calib_pos.append(rel)
                calib_earw.append(earw)
                remain = CALIB_SECONDS - (now - calib_start)
                if remain <= 0:
                    center = np.median(np.array(calib_pos), axis=0)
                    earw_base = float(np.median(calib_earw))
                    print(f"기준 측정 완료: center={center.round(3)}, earw={earw_base:.3f}")
                else:
                    status_lines.append(
                        (f"CALIBRATING... look straight ({remain:.1f}s)", (255, 200, 0)))

            if center is not None:
                v = rel_s - center
                turned = earw < earw_base * YAW_SHRINK       # ② 고개 돌림 증거
                moved_down = v[1] > Y_MIN                     # ① 아래로
                side = None
                if v[0] < -X_MIN:
                    side = "LEFT"
                elif v[0] > X_MIN:
                    side = "RIGHT"

                diagonal_ok = turned and moved_down and side is not None

                # ── 상태머신 ──
                if state == "NEUTRAL":
                    guide = "turn head 45deg, then bow diagonally down"
                    if diagonal_ok:
                        state, hold_side, hold_start = "HOLDING", side, now
                        cond_broken_since = None
                elif state == "HOLDING":
                    guide = f"hold it! ({hold_side})"
                    ok_now = diagonal_ok and side == hold_side
                    if ok_now:
                        cond_broken_since = None
                    else:
                        cond_broken_since = cond_broken_since or now
                    if cond_broken_since and (now - cond_broken_since) >= HOLD_GRACE_SECONDS:
                        state, hold_side, hold_start = "NEUTRAL", None, None
                    elif now - hold_start >= HOLD_SECONDS:
                        count[hold_side] += 1
                        print(f"{hold_side} 완료! (L{count['LEFT']} / R{count['RIGHT']})")
                        state, hold_side, hold_start = "RETURN", None, None
                else:  # RETURN
                    guide = "good! return to center"
                    if np.linalg.norm(v) < NEUTRAL_R:
                        state = "NEUTRAL"

                # ── 표시 ──
                in_hold = state == "HOLDING"
                color = (0, 200, 0) if in_hold else (255, 200, 0) if state == "RETURN" else (200, 200, 200)
                status_lines.append((guide, color))
                if in_hold:
                    held = now - hold_start
                    status_lines.append((f"hold {held:.1f}/{HOLD_SECONDS:.0f}s", color))
                    bar_w = int(w * 0.4)
                    filled = int(bar_w * min(held / HOLD_SECONDS, 1.0))
                    cv2.rectangle(frame, (10, h - 40), (10 + bar_w, h - 20), (80, 80, 80), 1)
                    cv2.rectangle(frame, (10, h - 40), (10 + filled, h - 20), color, -1)

                shrink_pct = (earw / earw_base * 100) if earw_base else 100
                status_lines.append(
                    (f"nose x{v[0]:+.2f} y{v[1]:+.2f} (need |x|>{X_MIN} y>{Y_MIN})",
                     (200, 200, 200)))
                status_lines.append(
                    (f"turned {'Y' if turned else 'N'} (ear-width {shrink_pct:.0f}%, "
                     f"need <{YAW_SHRINK*100:.0f}%)",
                     (0, 200, 0) if turned else (0, 165, 255)))
                status_lines.append(
                    (f"count  LEFT {count['LEFT']}  |  RIGHT {count['RIGHT']}", (0, 200, 0)))

                cv2.circle(frame, tuple(nose.astype(int)), 5, color, -1)
        else:
            status_lines.append(("person not found...", (0, 165, 255)))

        fps = 1.0 / (now - prev_time) if now > prev_time else 0.0
        prev_time = now
        status_lines.append((f"FPS {fps:.1f} | r: recalibrate", (200, 200, 200)))

        for i, (text, color) in enumerate(status_lines):
            cv2.putText(frame, text, (10, 30 + i * 28),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.7, color, 2)

        cv2.imshow("Neck Stretch 3: Diagonal (q: quit)", frame)
        key = cv2.waitKey(1) & 0xFF
        if key == ord("q"):
            break
        if key == ord("r"):
            center = earw_base = None
            calib_start = None
            calib_pos, calib_earw = [], []
            pos_window.clear()
            state, hold_side, hold_start, cond_broken_since = "NEUTRAL", None, None, None
            print("기준 재측정 — 정면을 봐주세요.")

    cap.release()
    cv2.destroyAllWindows()
    pose.close()


if __name__ == "__main__":
    main()
