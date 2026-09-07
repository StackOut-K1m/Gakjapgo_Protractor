# 어깨 스트레칭 ① 크로스바디(팔을 몸 쪽으로 굽혀 반대 팔로 당겨주기) 인식·카운트 (웹캠, MediaPipe Pose)

import time

import cv2
import mediapipe as mp
import numpy as np

HOLD_SECONDS = 4.0        # 유지 시간 (실서비스는 stretchings.hold_seconds)
CROSS_MARGIN = -0.1       # 손목이 반대 어깨 x를 이만큼(어깨너비 배수) 넘어야 인정
HEIGHT_BAND = 0.8         # 손목 높이 허용 범위 (어깨선 ± 어깨너비*이 값)
# 자기 어깨에서 반대쪽으로 이 거리(어깨너비 배수) 이상 이동해야 "뻗었다"로 본다.
# MediaPipe 는 가려진 손목도 위치를 추정해 내보내므로, 이 조건이 없으면
# 책상에 얹어 둔 반대쪽 손이 함께 통과해 라벨이 뒤바뀐다.
TRAVEL_MIN = 0.7
VIS_MIN = 0.5             # 손목 최소 visibility
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

    # 상태머신: NEUTRAL → HOLDING → (카운트) → RETURN → NEUTRAL
    state = "NEUTRAL"
    hold_side = None       # 'LEFT' | 'RIGHT' (화면 기준: 어느 쪽 팔을 스트레칭 중인지)
    hold_start = None
    cond_broken_since = None
    count = {"LEFT": 0, "RIGHT": 0}
    prev_time = time.time()

    print("크로스바디 스트레칭 — 한쪽 팔을 가슴 앞으로 가로질러 뻗으세요. 종료: q")
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

            sh_l, sh_r = xy(lm, P.LEFT_SHOULDER, w, h), xy(lm, P.RIGHT_SHOULDER, w, h)
            wr_l, wr_r = xy(lm, P.LEFT_WRIST, w, h), xy(lm, P.RIGHT_WRIST, w, h)
            shoulder_w = np.linalg.norm(sh_l - sh_r)
            shoulder_mid_y = (sh_l[1] + sh_r[1]) / 2
            if shoulder_w < 1:
                continue

            # (손목, 자기 어깨, 반대 어깨, visibility) 쌍 — 라벨은 "화면 기준" 어깨 위치로 결정
            pairs = [
                (wr_l, sh_l, sh_r, lm[P.LEFT_WRIST].visibility),
                (wr_r, sh_r, sh_l, lm[P.RIGHT_WRIST].visibility),
            ]

            # 둘 다 조건을 만족하면 더 멀리 뻗은 팔을 고른다.
            # 마지막에 통과한 쪽을 그냥 쓰면 실제로 움직인 팔과 라벨이 어긋나
            # "반대쪽도 해주세요" 단계에서 영원히 진행되지 않는다.
            crossing = None
            best_travel = -1.0
            debug = []
            for wrist, own_sh, oth_sh, vis in pairs:
                label = "LEFT" if own_sh[0] < oth_sh[0] else "RIGHT"  # 화면 기준
                direction = 1.0 if oth_sh[0] > own_sh[0] else -1.0     # 가로지르는 방향
                # 자기 어깨에서 반대쪽으로 얼마나 이동했는가 (팔을 실제로 뻗었는지)
                travel = float((wrist[0] - own_sh[0]) * direction / shoulder_w)
                # 손목이 반대 어깨를 넘어섰는가 (진행량, 어깨너비 정규화)
                beyond = float((wrist[0] - oth_sh[0]) * direction / shoulder_w)
                height_ok = abs(wrist[1] - shoulder_mid_y) < shoulder_w * HEIGHT_BAND
                ok = (vis > VIS_MIN and beyond > CROSS_MARGIN
                      and height_ok and travel >= TRAVEL_MIN)
                if ok and travel > best_travel:
                    crossing, best_travel = label, travel
                debug.append(
                    f"{label} tr{travel:+.2f} by{beyond:+.2f}{'H' if height_ok else '-'}")

            # ── 상태머신 ──
            if state == "NEUTRAL":
                guide = "stretch one arm across your chest"
                if crossing:
                    state, hold_side, hold_start = "HOLDING", crossing, now
                    cond_broken_since = None
            elif state == "HOLDING":
                guide = f"hold it! ({hold_side} arm)"
                if crossing == hold_side:
                    cond_broken_since = None
                else:
                    cond_broken_since = cond_broken_since or now
                if cond_broken_since and (now - cond_broken_since) >= HOLD_GRACE_SECONDS:
                    state, hold_side, hold_start = "NEUTRAL", None, None
                elif now - hold_start >= HOLD_SECONDS:
                    count[hold_side] += 1
                    print(f"{hold_side} 완료! (L{count['LEFT']} / R{count['RIGHT']})")
                    state, hold_side, hold_start = "RETURN", None, None
            else:  # RETURN — 팔을 풀어야 다음 회
                guide = "good! relax your arm"
                if crossing is None:
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

            for wrist, *_ in pairs:
                cv2.circle(frame, tuple(wrist.astype(int)), 6,
                           (0, 200, 0) if crossing else (200, 200, 200), -1)
        else:
            status_lines.append(("person not found...", (0, 165, 255)))

        fps = 1.0 / (now - prev_time) if now > prev_time else 0.0
        prev_time = now
        status_lines.append((f"FPS {fps:.1f}", (200, 200, 200)))

        for i, (text, color) in enumerate(status_lines):
            cv2.putText(frame, text, (10, 30 + i * 28),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.65, color, 2)

        cv2.imshow("Shoulder Stretch 1: Cross-body (q: quit)", frame)
        if cv2.waitKey(1) & 0xFF == ord("q"):
            break

    cap.release()
    cv2.destroyAllWindows()
    pose.close()


if __name__ == "__main__":
    main()
