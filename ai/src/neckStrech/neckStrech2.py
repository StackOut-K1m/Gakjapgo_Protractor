# 목 스트레칭 ② 목 돌리기(원 그리기) 인식·카운트 테스트 (웹캠, MediaPipe Pose)

import time
from collections import deque

import cv2
import mediapipe as mp
import numpy as np

CALIB_SECONDS = 3.0     # 정면 기준 측정 시간
R_MIN = 0.13            # 이 반지름(어깨너비 배수) 이상 벗어나야 회전으로 인정
MIN_ROLL_SECONDS = 2.0  # 1바퀴 최소 소요 시간 (이보다 빠르면 무효)
IDLE_RESET_SECONDS = 1.5  # 중심 근처에 이 시간 이상 머물면 누적각 리셋
SMOOTH_FRAMES = 4       # 코 위치 이동평균 프레임 수

# ── 치팅 방지 파라미터 ──
SIDE_ZONE = 0.55        # |v_x| > 반지름*이 비율이면 "좌/우 구간"
BOTTOM_ZONE = 0.55      # v_y > 반지름*이 비율이면 "아래 구간"
ROLL_MIN_DEG = 7.0      # 좌/우 구간에서 요구되는 최소 머리 기울기(도)
PITCH_MIN = 0.08        # 아래 구간에서 요구되는 최소 고개 숙임 (정규화 단위)
TILT_OK_RATIO = 0.5     # 검사 프레임 중 이 비율 이상 통과해야 진짜 목돌리기로 인정

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
    calib_roll: list[float] = []
    calib_pitch: list[float] = []
    center = None        # 정면일 때 코 상대좌표
    roll_base = None     # 정면일 때 귀선 각도
    pitch_base = None    # 정면일 때 (코y-귀중점y)/어깨너비

    pos_window: deque[np.ndarray] = deque(maxlen=SMOOTH_FRAMES)

    cum_deg = 0.0
    prev_theta = None
    roll_started_at = None
    idle_since = None
    tilt_checked = 0     # 이번 바퀴에서 기울기 검사한 프레임 수
    tilt_ok = 0          # 그중 통과한 프레임 수
    count = {"CW": 0, "CCW": 0}
    msg, msg_until = "", 0.0
    prev_time = time.time()

    def reset_circle():
        nonlocal cum_deg, roll_started_at, tilt_checked, tilt_ok
        cum_deg = 0.0
        roll_started_at = None
        tilt_checked = 0
        tilt_ok = 0

    print("목 돌리기 테스트 — 처음 3초간 정면을 봐주세요(기준 측정). 종료: q, 재측정: r")
    while True:
        ok, frame = cap.read()
        if not ok:
            break
        frame = cv2.flip(frame, 1)  # 거울 모드
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

            rel = (nose - shoulder_mid) / shoulder_w
            pos_window.append(rel)
            rel_s = np.mean(pos_window, axis=0)

            # 머리 기울기(귀선 각도)와 고개 숙임 지표
            de = ear_r - ear_l
            roll_deg = float(np.degrees(np.arctan2(de[1], de[0])))
            pitch = float((nose[1] - ear_mid[1]) / shoulder_w)

            # ── 캘리브레이션 ──
            if center is None:
                calib_start = calib_start or now
                calib_pos.append(rel)
                calib_roll.append(roll_deg)
                calib_pitch.append(pitch)
                remain = CALIB_SECONDS - (now - calib_start)
                if remain <= 0:
                    center = np.median(np.array(calib_pos), axis=0)
                    roll_base = float(np.median(calib_roll))
                    pitch_base = float(np.median(calib_pitch))
                    print(f"기준 측정 완료: center={center.round(3)}, "
                          f"roll={roll_base:.1f}deg, pitch={pitch_base:.3f}")
                else:
                    status_lines.append(
                        (f"CALIBRATING... look straight ({remain:.1f}s)", (255, 200, 0)))

            if center is not None:
                v = rel_s - center
                radius = float(np.linalg.norm(v))
                theta = np.degrees(np.arctan2(v[1], v[0]))
                roll_dev = roll_deg - roll_base
                pitch_dev = pitch - pitch_base

                if radius >= R_MIN:
                    idle_since = None
                    if prev_theta is not None:
                        d = theta - prev_theta
                        if d > 180:
                            d -= 360
                        elif d < -180:
                            d += 360
                        if roll_started_at is None:
                            roll_started_at = now
                        cum_deg += d
                    prev_theta = theta

                    # ── 치팅 방지: 구간별 머리 기울기 검사 ──
                    # 좌/우 구간: 머리가 옆으로 기울어야 함 (평행이동이면 0 근처)
                    if abs(v[0]) > radius * SIDE_ZONE:
                        tilt_checked += 1
                        if abs(roll_dev) > ROLL_MIN_DEG:
                            tilt_ok += 1
                    # 아래 구간: 턱이 숙여져야 함
                    elif v[1] > radius * BOTTOM_ZONE:
                        tilt_checked += 1
                        if pitch_dev > PITCH_MIN:
                            tilt_ok += 1
                    # 위 구간은 랜드마크가 불안정해서 검사하지 않음

                    # ── 1바퀴 완성 판정 ──
                    if abs(cum_deg) >= 360.0:
                        elapsed = now - (roll_started_at or now)
                        direction = "CW" if cum_deg > 0 else "CCW"
                        ratio = (tilt_ok / tilt_checked) if tilt_checked else 0.0
                        if elapsed < MIN_ROLL_SECONDS:
                            msg, msg_until = "too fast! roll slowly", now + 2.0
                            print("너무 빠릅니다 — 천천히 돌려주세요 (무효)")
                        elif ratio < TILT_OK_RATIO:
                            msg, msg_until = "tilt your NECK, not your body!", now + 2.0
                            print(f"목 기울임 부족(일치율 {ratio*100:.0f}%) — "
                                  "몸/얼굴 평행이동은 인정되지 않습니다 (무효)")
                        else:
                            count[direction] += 1
                            msg, msg_until = f"{direction} +1", now + 1.5
                            print(f"{direction} 1바퀴! (CW {count['CW']} / CCW {count['CCW']}, "
                                  f"일치율 {ratio*100:.0f}%)")
                        reset_circle()
                else:
                    prev_theta = None
                    idle_since = idle_since or now
                    if (now - idle_since) > IDLE_RESET_SECONDS and cum_deg != 0.0:
                        reset_circle()

                progress = min(abs(cum_deg) / 360.0, 1.0) * 100
                direction_now = "CW" if cum_deg > 0 else "CCW" if cum_deg < 0 else "-"
                live_ratio = (tilt_ok / tilt_checked * 100) if tilt_checked else 0.0

                # ── 표시 ──
                active = radius >= R_MIN
                color = (0, 200, 0) if active else (200, 200, 200)
                status_lines.append(
                    ("rolling..." if active else "roll your head in a circle", color))
                status_lines.append(
                    (f"progress {progress:.0f}% ({direction_now})  r={radius:.2f}", color))
                status_lines.append(
                    (f"neck-tilt check {live_ratio:.0f}% (need {TILT_OK_RATIO*100:.0f}%)"
                     f"  roll {roll_dev:+.0f}deg pitch {pitch_dev:+.2f}",
                     (0, 200, 0) if live_ratio >= TILT_OK_RATIO * 100 else (0, 165, 255)))
                status_lines.append(
                    (f"count  CW {count['CW']}  |  CCW {count['CCW']}", (0, 200, 0)))
                if now < msg_until:
                    status_lines.append((msg, (0, 200, 0) if "+1" in msg else (0, 0, 255)))

                # 진행 원호·코 위치 시각화
                c_px = (shoulder_mid + center * shoulder_w).astype(int)
                cv2.circle(frame, tuple(c_px), int(R_MIN * shoulder_w), (100, 100, 100), 1)
                if abs(cum_deg) > 5:
                    cv2.ellipse(frame, tuple(c_px), (int(R_MIN * shoulder_w),) * 2,
                                0, 0, cum_deg % 360 if cum_deg > 0 else -(abs(cum_deg) % 360),
                                (0, 200, 0), 3)
                cv2.circle(frame, tuple(nose.astype(int)), 5, color, -1)

                bar_w = int(w * 0.4)
                filled = int(bar_w * progress / 100)
                cv2.rectangle(frame, (10, h - 40), (10 + bar_w, h - 20), (80, 80, 80), 1)
                cv2.rectangle(frame, (10, h - 40), (10 + filled, h - 20), (0, 200, 0), -1)
        else:
            status_lines.append(("person not found...", (0, 165, 255)))
            prev_theta = None

        fps = 1.0 / (now - prev_time) if now > prev_time else 0.0
        prev_time = now
        status_lines.append((f"FPS {fps:.1f} | r: recalibrate", (200, 200, 200)))

        for i, (text, color) in enumerate(status_lines):
            cv2.putText(frame, text, (10, 30 + i * 28),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.7, color, 2)

        cv2.imshow("Neck Stretch 2: Neck Roll (q: quit)", frame)
        key = cv2.waitKey(1) & 0xFF
        if key == ord("q"):
            break
        if key == ord("r"):
            center = roll_base = pitch_base = None
            calib_start = None
            calib_pos, calib_roll, calib_pitch = [], [], []
            pos_window.clear()
            prev_theta, idle_since = None, None
            reset_circle()
            print("기준 재측정 — 정면을 봐주세요.")

    cap.release()
    cv2.destroyAllWindows()
    pose.close()


if __name__ == "__main__":
    main()
