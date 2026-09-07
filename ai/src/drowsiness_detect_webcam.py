# MediaPipe FaceMesh 기반 졸음 감지 실시간 테스트 (웹캠)
#
# 실행: python drowsiness_detect_webcam.py   (turtleneck 환경, 추가 설치 불필요)
# 종료: q  |  기준선 재측정: r
#
# 판정 원리 (기능명세 FR-AI-03: "눈 감김 지속시간으로 졸음 판정"):
#   - EAR(Eye Aspect Ratio) = 눈의 세로/가로 비율. 눈을 감으면 급락한다.
#   - 시작 후 CALIB_SECONDS 동안 "뜬 눈 EAR 기준선"을 자동 측정하고(캘리브레이션),
#     기준선 * EAR_CLOSE_RATIO 미만이면 "감김"으로 판정한다. (고정 임계값 X — 개인 맞춤)
#   - 감김이 DROWSY_SECONDS 이상 지속되면 졸음 확정. 깜빡임(~0.2초)은 걸리지 않는다.
#   - 얼굴 미검출 지속 시 NO FACE.
import time
from collections import deque

import cv2
import mediapipe as mp
import numpy as np

CALIB_SECONDS = 3.0      # 시작 후 이 시간 동안 눈 뜬 상태 기준선 측정
EAR_CLOSE_RATIO = 0.68   # 기준선 대비 이 비율 미만이면 "감김" (0.75 는 내려다볼 때 오탐이 많았다)
EAR_MIN_FLOOR = 0.10     # 임계값 하한 (기준선이 비정상적으로 낮게 잡혔을 때 보호)
DROWSY_SECONDS = 4.0     # 눈 감김이 이 시간 이상 지속되면 졸음 확정 (2.0 은 실사용에서 오탐이 많았다)
NO_FACE_SECONDS = 3.0    # 얼굴 미검출 지속 시 자리비움 표시
SMOOTH_FRAMES = 5        # EAR 이동평균 프레임 수 (측정 떨림 완화)

# MediaPipe FaceMesh 랜드마크 인덱스 (EAR 표준 조합)
LEFT_EYE = [33, 160, 158, 133, 153, 144]   # p1, p2, p3, p4, p5, p6
RIGHT_EYE = [362, 385, 387, 263, 373, 380]


def aspect_ratio(pts: np.ndarray) -> float:
    """EAR = (|p2-p6| + |p3-p5|) / (2 * |p1-p4|)"""
    v1 = np.linalg.norm(pts[1] - pts[5])
    v2 = np.linalg.norm(pts[2] - pts[4])
    h = np.linalg.norm(pts[0] - pts[3])
    return (v1 + v2) / (2.0 * h) if h > 0 else 0.0


def eye_points(landmarks, indices, w, h) -> np.ndarray:
    return np.array([[landmarks[i].x * w, landmarks[i].y * h] for i in indices])


def main() -> None:
    face_mesh = mp.solutions.face_mesh.FaceMesh(
        max_num_faces=1,
        refine_landmarks=True,  # 눈·홍채 랜드마크 정밀 모드
        min_detection_confidence=0.5,
        min_tracking_confidence=0.5,
    )

    cap = cv2.VideoCapture(0)
    if not cap.isOpened():
        print("웹캠을 열 수 없습니다. 다른 앱이 카메라를 쓰고 있는지 확인하세요.")
        return

    # 캘리브레이션 상태
    calib_start = None       # 기준선 측정 시작 시각
    calib_samples: list[float] = []
    baseline = None          # 뜬 눈 EAR 기준선
    threshold = None         # baseline * EAR_CLOSE_RATIO

    ear_window: deque[float] = deque(maxlen=SMOOTH_FRAMES)
    eyes_closed_since = None
    face_missing_since = None
    drowsy_events = 0
    prev_time = time.time()

    print("졸음 감지 시작 — 처음 3초간 눈을 뜨고 정면을 봐주세요(기준선 측정). 종료: q, 재측정: r")
    while True:
        ok, frame = cap.read()
        if not ok:
            break
        h, w = frame.shape[:2]

        results = face_mesh.process(cv2.cvtColor(frame, cv2.COLOR_BGR2RGB))
        now = time.time()

        status_lines = []
        if results.multi_face_landmarks:
            face_missing_since = None
            lm = results.multi_face_landmarks[0].landmark

            # ── EAR (양쪽 평균 + 이동평균 스무딩) ──
            left = eye_points(lm, LEFT_EYE, w, h)
            right = eye_points(lm, RIGHT_EYE, w, h)
            raw_ear = (aspect_ratio(left) + aspect_ratio(right)) / 2.0
            ear_window.append(raw_ear)
            ear = float(np.mean(ear_window))

            # ── 캘리브레이션 (뜬 눈 기준선 측정) ──
            if baseline is None:
                calib_start = calib_start or now
                calib_samples.append(raw_ear)
                remain = CALIB_SECONDS - (now - calib_start)
                if remain <= 0:
                    baseline = float(np.median(calib_samples))
                    threshold = max(baseline * EAR_CLOSE_RATIO, EAR_MIN_FLOOR)
                    print(f"기준선 측정 완료: baseline={baseline:.3f}, threshold={threshold:.3f}")
                else:
                    status_lines.append(
                        (f"CALIBRATING... eyes OPEN please ({remain:.1f}s)", (255, 200, 0)))
                    status_lines.append((f"EAR {ear:.3f}", (200, 200, 200)))

            if baseline is not None:
                closed = ear < threshold

                # ── 눈 감김 지속시간 판정 ──
                if closed:
                    eyes_closed_since = eyes_closed_since or now
                    closed_for = now - eyes_closed_since
                else:
                    if eyes_closed_since and (now - eyes_closed_since) >= DROWSY_SECONDS:
                        drowsy_events += 1
                    eyes_closed_since = None
                    closed_for = 0.0
                drowsy = closed_for >= DROWSY_SECONDS

                # ── 눈 랜드마크 표시 ──
                color = (0, 0, 255) if closed else (0, 200, 0)
                for p in np.vstack([left, right]).astype(int):
                    cv2.circle(frame, tuple(p), 2, color, -1)

                status_lines.append(
                    (f"EAR {ear:.3f} (base {baseline:.3f} / th {threshold:.3f})", color))
                if drowsy:
                    status_lines.append((f"DROWSY! closed {closed_for:.1f}s", (0, 0, 255)))
                elif closed_for > 0:
                    status_lines.append((f"eyes closed {closed_for:.1f}s...", (0, 165, 255)))
                else:
                    status_lines.append((f"awake | drowsy events: {drowsy_events}", (0, 200, 0)))
        else:
            eyes_closed_since = None
            face_missing_since = face_missing_since or now
            if (now - face_missing_since) >= NO_FACE_SECONDS:
                status_lines.append(("NO FACE (away?)", (0, 0, 255)))
            else:
                status_lines.append(("face not found...", (0, 165, 255)))

        # FPS
        fps = 1.0 / (now - prev_time) if now > prev_time else 0.0
        prev_time = now
        status_lines.append((f"FPS {fps:.1f} | r: recalibrate", (200, 200, 200)))

        for i, (text, color) in enumerate(status_lines):
            cv2.putText(frame, text, (10, 30 + i * 28),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.7, color, 2)

        cv2.imshow("Drowsiness Detection Test (q: quit)", frame)
        key = cv2.waitKey(1) & 0xFF
        if key == ord("q"):
            break
        if key == ord("r"):  # 기준선 재측정
            baseline = None
            threshold = None
            calib_start = None
            calib_samples = []
            eyes_closed_since = None
            print("기준선 재측정 — 눈을 뜨고 정면을 봐주세요.")

    cap.release()
    cv2.destroyAllWindows()
    face_mesh.close()


if __name__ == "__main__":
    main()
