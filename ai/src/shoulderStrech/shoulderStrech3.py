# 어깨 스트레칭 ③ 어깨 돌리기(원 그리기) 인식·카운트 (웹캠, MediaPipe Pose)

import time
from collections import deque

import cv2
import mediapipe as mp
import numpy as np

CALIB_SECONDS = 3.0      # 기준 측정 시간 (어깨 내리고 편하게)
RISE_MIN = 0.06          # "올라감" 인정 상승량 (어깨너비 배수)
BOTH_MIN = 0.04          # 좌/우 각각 요구되는 최소 상승량
RETURN_RATIO = 0.4       # 상승량이 RISE_MIN*이 비율 미만이면 "내려옴" 인정
MIN_CYCLE_SECONDS = 0.8  # 1사이클(올림→내림) 최소 소요 시간 — 잔떨림 방지
HEAD_STILL_MAX = 0.08    # 머리 pitch 편차 허용 (고개 숙임 치팅 방지)
SMOOTH_FRAMES = 4

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

    # 캘리브레이션 (어깨 내린 편안한 자세)
    calib_start = None
    calib_gap: list[float] = []
    calib_gap_l: list[float] = []
    calib_gap_r: list[float] = []
    calib_pitch: list[float] = []
    gap_base = gap_l_base = gap_r_base = pitch_base = None

    gap_window: deque[float] = deque(maxlen=SMOOTH_FRAMES)

    # 사이클 상태머신: DOWN(내림) → UP(올라감) → 내려오면 1회
    state = "DOWN"
    up_started_at = None
    peak_rise = 0.0
    count = 0
    msg, msg_until = "", 0.0
    prev_time = time.time()

    print("어깨 돌리기 테스트 — 처음 3초간 어깨 내리고 편하게 정면을 봐주세요. 종료: q, 재측정: r")
    while True:
        ok, frame = cap.read()
        if not ok:
            break
        frame = cv2.flip(frame, 1)
        h, w = frame.shape[:2]

        results = pose.process(cv2.cvtColor(frame, cv2.COLOR_BGR2RGB))
        now = time.time()

        status_lines = []
        if results.pose_landmarks:
            lm = results.pose_landmarks.landmark

            nose = xy(lm, P.NOSE, w, h)
            ear_l, ear_r = xy(lm, P.LEFT_EAR, w, h), xy(lm, P.RIGHT_EAR, w, h)
            ear_mid = (ear_l + ear_r) / 2
            sh_l, sh_r = xy(lm, P.LEFT_SHOULDER, w, h), xy(lm, P.RIGHT_SHOULDER, w, h)
            shoulder_w = np.linalg.norm(sh_l - sh_r)
            shoulder_mid = (sh_l + sh_r) / 2
            if shoulder_w < 1:
                continue

            gap = float((shoulder_mid[1] - ear_mid[1]) / shoulder_w)
            gap_l = float((sh_l[1] - ear_l[1]) / shoulder_w)
            gap_r = float((sh_r[1] - ear_r[1]) / shoulder_w)
            pitch = float((nose[1] - ear_mid[1]) / shoulder_w)

            gap_window.append(gap)
            gap_s = float(np.mean(gap_window))

            # ── 캘리브레이션 ──
            if gap_base is None:
                calib_start = calib_start or now
                calib_gap.append(gap)
                calib_gap_l.append(gap_l)
                calib_gap_r.append(gap_r)
                calib_pitch.append(pitch)
                remain = CALIB_SECONDS - (now - calib_start)
                if remain <= 0:
                    gap_base = float(np.median(calib_gap))
                    gap_l_base = float(np.median(calib_gap_l))
                    gap_r_base = float(np.median(calib_gap_r))
                    pitch_base = float(np.median(calib_pitch))
                    print(f"기준 측정 완료: gap={gap_base:.3f}")
                else:
                    status_lines.append(
                        (f"CALIBRATING... relax shoulders ({remain:.1f}s)", (255, 200, 0)))

            if gap_base is not None:
                rise = gap_base - gap_s
                rise_l = gap_l_base - gap_l
                rise_r = gap_r_base - gap_r
                head_still = abs(pitch - pitch_base) < HEAD_STILL_MAX

                up_now = (
                    rise > RISE_MIN
                    and rise_l > BOTH_MIN
                    and rise_r > BOTH_MIN
                    and head_still
                )
                down_now = rise < RISE_MIN * RETURN_RATIO

                # ── 사이클 상태머신 ──
                if state == "DOWN":
                    guide = "roll your shoulders (up and around)"
                    if up_now:
                        state, up_started_at, peak_rise = "UP", now, rise
                else:  # UP
                    guide = "keep rolling..."
                    peak_rise = max(peak_rise, rise)
                    if down_now:
                        elapsed = now - (up_started_at or now)
                        if elapsed >= MIN_CYCLE_SECONDS:
                            count += 1
                            msg, msg_until = f"+1 (roll {count})", now + 1.2
                            print(f"어깨 돌리기 {count}회! (진폭 {peak_rise:.2f})")
                        else:
                            msg, msg_until = "too quick! roll bigger & slower", now + 1.5
                        state, up_started_at, peak_rise = "DOWN", None, 0.0

                # ── 표시 ──
                in_up = state == "UP"
                color = (0, 200, 0) if in_up else (200, 200, 200)
                status_lines.append((guide, color))
                status_lines.append(
                    (f"rise {rise:+.3f} (need {RISE_MIN}) L{rise_l:+.2f} R{rise_r:+.2f}",
                     color))
                status_lines.append(
                    (f"head still {'Y' if head_still else 'N (keep head straight!)'}",
                     (0, 200, 0) if head_still else (0, 0, 255)))
                status_lines.append((f"count {count}", (0, 200, 0)))
                if now < msg_until:
                    status_lines.append((msg, (0, 200, 0) if "+1" in msg else (0, 0, 255)))

                # 상승량 게이지 (세로 바)
                gauge_h = int(h * 0.3)
                filled = int(gauge_h * min(max(rise, 0) / (RISE_MIN * 2), 1.0))
                x0 = w - 40
                cv2.rectangle(frame, (x0, h - 40 - gauge_h), (x0 + 20, h - 40), (80, 80, 80), 1)
                cv2.rectangle(frame, (x0, h - 40 - filled), (x0 + 20, h - 40),
                              (0, 200, 0) if up_now else (150, 150, 150), -1)
                # RISE_MIN 눈금선
                y_mark = h - 40 - int(gauge_h * 0.5)
                cv2.line(frame, (x0 - 5, y_mark), (x0 + 25, y_mark), (0, 165, 255), 2)

                for p_, r_ in ((sh_l, rise_l), (sh_r, rise_r)):
                    c = (0, 200, 0) if r_ > BOTH_MIN else (200, 200, 200)
                    cv2.circle(frame, tuple(p_.astype(int)), 6, c, -1)
        else:
            status_lines.append(("person not found...", (0, 165, 255)))

        fps = 1.0 / (now - prev_time) if now > prev_time else 0.0
        prev_time = now
        status_lines.append((f"FPS {fps:.1f} | r: recalibrate", (200, 200, 200)))

        for i, (text, color) in enumerate(status_lines):
            cv2.putText(frame, text, (10, 30 + i * 28),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.65, color, 2)

        cv2.imshow("Shoulder Stretch 3: Shoulder Rolls (q: quit)", frame)
        key = cv2.waitKey(1) & 0xFF
        if key == ord("q"):
            break
        if key == ord("r"):
            gap_base = gap_l_base = gap_r_base = pitch_base = None
            calib_start = None
            calib_gap, calib_gap_l, calib_gap_r, calib_pitch = [], [], [], []
            gap_window.clear()
            state, up_started_at, peak_rise = "DOWN", None, 0.0
            print("기준 재측정 — 어깨 내리고 편하게 정면을 봐주세요.")

    cap.release()
    cv2.destroyAllWindows()
    pose.close()


if __name__ == "__main__":
    main()
