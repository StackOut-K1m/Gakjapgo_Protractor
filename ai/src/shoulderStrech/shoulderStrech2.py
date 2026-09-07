# 어깨 스트레칭 ② 팔 머리 뒤로 굽혀 당기기(오버헤드 삼두·어깨) 인식·카운트 (웹캠, MediaPipe Pose)

import time

import cv2
import mediapipe as mp
import numpy as np

HOLD_SECONDS = 7.0        # 유지 시간
ELBOW_ABOVE = 0.0         # 팔꿈치가 귀중점보다 이만큼(어깨너비 배수) 위면 인정 (0 = 귀 높이)
HEAD_X_BAND = 0.7         # 팔꿈치 가로 위치: 머리 중앙 ± 어깨너비*이 값 이내
VIS_MIN = 0.5             # 팔꿈치 최소 visibility
HOLD_GRACE_SECONDS = 0.8  # 유지 중 순간 끊김 허용 (머리 뒤 가림 대응)

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

    state = "NEUTRAL"   # NEUTRAL → HOLDING → RETURN → NEUTRAL
    hold_side = None
    hold_start = None
    cond_broken_since = None
    count = {"LEFT": 0, "RIGHT": 0}
    prev_time = time.time()

    print("팔 머리 뒤로 굽혀 당기기 — 한쪽 팔꿈치를 머리 위로 올리세요. 종료: q")
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

            ear_l, ear_r = xy(lm, P.LEFT_EAR, w, h), xy(lm, P.RIGHT_EAR, w, h)
            ear_mid = (ear_l + ear_r) / 2
            sh_l, sh_r = xy(lm, P.LEFT_SHOULDER, w, h), xy(lm, P.RIGHT_SHOULDER, w, h)
            el_l, el_r = xy(lm, P.LEFT_ELBOW, w, h), xy(lm, P.RIGHT_ELBOW, w, h)
            shoulder_w = np.linalg.norm(sh_l - sh_r)
            if shoulder_w < 1:
                continue

            pairs = [
                (el_l, sh_l, sh_r, lm[P.LEFT_ELBOW].visibility),
                (el_r, sh_r, sh_l, lm[P.RIGHT_ELBOW].visibility),
            ]

            raised = None
            debug = []
            for elbow, own_sh, oth_sh, vis in pairs:
                label = "LEFT" if own_sh[0] < oth_sh[0] else "RIGHT"  # 화면 기준
                above = float((ear_mid[1] - elbow[1]) / shoulder_w)   # 귀보다 위 = 양수
                near_head = abs(elbow[0] - ear_mid[0]) < shoulder_w * HEAD_X_BAND
                if vis > VIS_MIN and above > ELBOW_ABOVE and near_head:
                    raised = label
                debug.append(f"{label} up{above:+.2f}{'H' if near_head else '-'}")

            # ── 상태머신 ──
            if state == "NEUTRAL":
                guide = "raise one elbow above your head, bend arm back"
                if raised:
                    state, hold_side, hold_start = "HOLDING", raised, now
                    cond_broken_since = None
            elif state == "HOLDING":
                guide = f"hold it! ({hold_side} arm)"
                if raised == hold_side:
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
                guide = "good! lower your arm"
                if raised is None:
                    state = "NEUTRAL"

            # ── 표시 ──
            in_hold = state == "HOLDING"
            color = (0, 200, 0) if in_hold else (255, 200, 0) if state == "RETURN" else (200, 200, 200)
            status_lines.append((guide, color))
            if in_hold and hold_start:
                held = now - hold_start
                status_lines.append((f"hold {held:.1f}/{HOLD_SECONDS:.0f}s", color))
                bar_w = int(w * 0.4)
                filled = int(bar_w * min(held / HOLD_SECONDS, 1.0))
                cv2.rectangle(frame, (10, h - 40), (10 + bar_w, h - 20), (80, 80, 80), 1)
                cv2.rectangle(frame, (10, h - 40), (10 + filled, h - 20), color, -1)
            status_lines.append((" | ".join(debug), (200, 200, 200)))
            status_lines.append(
                (f"count  LEFT {count['LEFT']}  |  RIGHT {count['RIGHT']}", (0, 200, 0)))

            for elbow, *_ in pairs:
                cv2.circle(frame, tuple(elbow.astype(int)), 6,
                           (0, 200, 0) if raised else (200, 200, 200), -1)
        else:
            status_lines.append(("person not found...", (0, 165, 255)))

        fps = 1.0 / (now - prev_time) if now > prev_time else 0.0
        prev_time = now
        status_lines.append((f"FPS {fps:.1f}", (200, 200, 200)))

        for i, (text, color) in enumerate(status_lines):
            cv2.putText(frame, text, (10, 30 + i * 28),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.65, color, 2)

        cv2.imshow("Shoulder Stretch 2: Overhead Bend (q: quit)", frame)
        if cv2.waitKey(1) & 0xFF == ord("q"):
            break

    cap.release()
    cv2.destroyAllWindows()
    pose.close()


if __name__ == "__main__":
    main()
