#어깨 스트레칭(거북목) 양 어깨를 위로 당겼다고 풀기.
import time
from collections import deque

import cv2
import mediapipe as mp
import numpy as np

CALIB_SECONDS = 3.0    # 기준 측정 시간 (어깨 내리고 편하게)
HOLD_SECONDS = 3.0     # 올린 상태 유지 시간 (이미지 기준 실서비스는 10초)
SHRUG_MIN = 0.08       # 귀-어깨 간격 축소량 최소치 (어깨너비 배수)
BOTH_MIN = 0.05        # 좌/우 각각 요구되는 최소 상승량
RETURN_RATIO = 0.4     # 축소량이 SHRUG_MIN*이 비율 미만이면 "내림" 인정
HEAD_STILL_MAX = 0.07  # 머리 자세(pitch) 편차가 이 이하일 때만 인정 (고개 숙임 치팅 방지)
SMOOTH_FRAMES = 4
HOLD_GRACE_SECONDS = 0.6  # 유지 중 순간 끊김 허용

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

    # 캘리브레이션 (어깨 완전히 내린 편안한 자세)
    calib_start = None
    calib_gap: list[float] = []
    calib_gap_l: list[float] = []
    calib_gap_r: list[float] = []
    calib_pitch: list[float] = []
    gap_base = gap_l_base = gap_r_base = pitch_base = None

    gap_window: deque[float] = deque(maxlen=SMOOTH_FRAMES)

    # 상태머신: DOWN(내림) → HOLD_UP(올려 유지) → (카운트) → DOWN
    state = "DOWN"
    hold_start = None
    cond_broken_since = None
    count = 0
    prev_time = time.time()

    print("어깨 으쓱 테스트 — 처음 3초간 어깨 내리고 편하게 정면을 봐주세요. 종료: q, 재측정: r")
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

            # 귀-어깨 세로 간격 (어깨너비 정규화). 으쓱하면 줄어든다.
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
                    print(f"기준 측정 완료: gap={gap_base:.3f} (L{gap_l_base:.3f}/R{gap_r_base:.3f})")
                else:
                    status_lines.append(
                        (f"CALIBRATING... relax shoulders ({remain:.1f}s)", (255, 200, 0)))

            if gap_base is not None:
                rise = gap_base - gap_s            # 전체 상승량 (양수 = 으쓱)
                rise_l = gap_l_base - gap_l        # 왼쪽 상승량
                rise_r = gap_r_base - gap_r        # 오른쪽 상승량
                head_still = abs(pitch - pitch_base) < HEAD_STILL_MAX

                shrug_ok = (
                    rise > SHRUG_MIN
                    and rise_l > BOTH_MIN
                    and rise_r > BOTH_MIN
                    and head_still
                )
                released = rise < SHRUG_MIN * RETURN_RATIO

                # ── 상태머신 ──
                if state == "DOWN":
                    guide = "shrug! raise both shoulders to your ears"
                    if shrug_ok:
                        state, hold_start, cond_broken_since = "HOLD_UP", now, None
                else:  # HOLD_UP
                    guide = "hold it up!"
                    if shrug_ok:
                        cond_broken_since = None
                    else:
                        cond_broken_since = cond_broken_since or now
                    if cond_broken_since and (now - cond_broken_since) >= HOLD_GRACE_SECONDS:
                        # 유지 실패 (충분히 못 버팀)
                        state, hold_start = "DOWN", None
                    elif now - hold_start >= HOLD_SECONDS and released:
                        # 유지 완료 후 내리면 카운트
                        count += 1
                        print(f"으쓱 {count}회!")
                        state, hold_start = "DOWN", None

                # 유지시간 채운 뒤에는 "내리세요" 안내
                if state == "HOLD_UP" and hold_start and now - hold_start >= HOLD_SECONDS:
                    guide = "good! now lower your shoulders"

                # ── 표시 ──
                in_hold = state == "HOLD_UP"
                color = (0, 200, 0) if in_hold else (200, 200, 200)
                status_lines.append((guide, color))
                if in_hold and hold_start:
                    held = min(now - hold_start, HOLD_SECONDS)
                    status_lines.append((f"hold {held:.1f}/{HOLD_SECONDS:.0f}s", color))
                    bar_w = int(w * 0.4)
                    filled = int(bar_w * held / HOLD_SECONDS)
                    cv2.rectangle(frame, (10, h - 40), (10 + bar_w, h - 20), (80, 80, 80), 1)
                    cv2.rectangle(frame, (10, h - 40), (10 + filled, h - 20), color, -1)

                status_lines.append(
                    (f"rise {rise:+.3f} (need {SHRUG_MIN}) L{rise_l:+.2f} R{rise_r:+.2f}",
                     (0, 200, 0) if rise > SHRUG_MIN else (200, 200, 200)))
                status_lines.append(
                    (f"head still {'Y' if head_still else 'N (keep head straight!)'}",
                     (0, 200, 0) if head_still else (0, 0, 255)))
                status_lines.append((f"count {count}", (0, 200, 0)))

                # 어깨 위치 표시
                for p, r_ in ((sh_l, rise_l), (sh_r, rise_r)):
                    c = (0, 200, 0) if r_ > BOTH_MIN else (200, 200, 200)
                    cv2.circle(frame, tuple(p.astype(int)), 6, c, -1)
        else:
            status_lines.append(("person not found...", (0, 165, 255)))

        fps = 1.0 / (now - prev_time) if now > prev_time else 0.0
        prev_time = now
        status_lines.append((f"FPS {fps:.1f} | r: recalibrate", (200, 200, 200)))

        for i, (text, color) in enumerate(status_lines):
            cv2.putText(frame, text, (10, 30 + i * 28),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.7, color, 2)

        cv2.imshow("Stretch 4: Shoulder Shrug (q: quit)", frame)
        key = cv2.waitKey(1) & 0xFF
        if key == ord("q"):
            break
        if key == ord("r"):
            gap_base = gap_l_base = gap_r_base = pitch_base = None
            calib_start = None
            calib_gap, calib_gap_l, calib_gap_r, calib_pitch = [], [], [], []
            gap_window.clear()
            state, hold_start, cond_broken_since = "DOWN", None, None
            print("기준 재측정 — 어깨 내리고 편하게 정면을 봐주세요.")

    cap.release()
    cv2.destroyAllWindows()
    pose.close()


if __name__ == "__main__":
    main()
