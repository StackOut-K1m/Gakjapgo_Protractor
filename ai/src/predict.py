"""학습한 모델을 실시간 웹캠으로 검증.

사용법:
    python predict.py              # 기본 웹캠(0)
    python predict.py --camera 1   # 다른 카메라
    창에서 q 키로 종료

models/turtleneck_model.json 을 로드해 프레임마다 거북목 확률을 표시합니다.
추론 수식(표준화 + 로지스틱)은 나중에 프론트(JS)와 100% 동일하게 씁니다.
"""

import argparse
import json
import math
from collections import deque
from pathlib import Path

import cv2
import mediapipe as mp

mp_pose = mp.solutions.pose

# ── 상수 (train.ipynb 와 동일하게 유지) ─────────────────────────
MODELS_DIR = Path(__file__).resolve().parent.parent / "models"

POSE_LANDMARKS = {
    "nose": 0,
    "left_eye": 2,
    "right_eye": 5,
    "left_ear": 7,
    "right_ear": 8,
    "left_shoulder": 11,
    "right_shoulder": 12,
}
LANDMARK_NAMES = list(POSE_LANDMARKS.keys())


# ── 피처 계산 (train.ipynb 의 compute_features 와 반드시 동일) ──
def _dist(a, b):
    return math.hypot(a[0] - b[0], a[1] - b[1])


def _midpoint(a, b):
    return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2]


def compute_features(points: dict):
    """좌표 → 어깨너비로 정규화한 피처 dict (필요한 랜드마크 없으면 None)."""
    nose = points["nose"]
    left_eye, right_eye = points["left_eye"], points["right_eye"]
    left_ear, right_ear = points["left_ear"], points["right_ear"]
    left_shoulder, right_shoulder = points["left_shoulder"], points["right_shoulder"]

    shoulder_width = _dist(left_shoulder, right_shoulder)
    if shoulder_width < 1e-6:
        return None
    shoulder_mid = _midpoint(left_shoulder, right_shoulder)
    ear_mid = _midpoint(left_ear, right_ear)
    eye_dist = _dist(left_eye, right_eye)
    if eye_dist < 1e-6:
        return None

    ear_shoulder_dy = ear_mid[1] - shoulder_mid[1]
    ear_shoulder_dz = ear_mid[2] - shoulder_mid[2]
    return {
        "eye_dist_ratio": eye_dist / shoulder_width,
        "ear_dist_ratio": _dist(left_ear, right_ear) / shoulder_width,
        "nose_above_shoulder": (shoulder_mid[1] - nose[1]) / shoulder_width,
        "ear_above_shoulder": (shoulder_mid[1] - ear_mid[1]) / shoulder_width,
        "nose_z_rel": (nose[2] - shoulder_mid[2]) / shoulder_width,
        "ear_z_rel": ear_shoulder_dz / shoulder_width,
        "acromion_proxy": math.hypot(ear_shoulder_dy, ear_shoulder_dz)
        / shoulder_width,
        "head_roll": (right_eye[1] - left_eye[1]) / eye_dist,
        "shoulder_tilt": (right_shoulder[1] - left_shoulder[1]) / shoulder_width,
    }


def points_visible(points: dict, min_visibility: float = 0.5) -> bool:
    for name in POSE_LANDMARKS:
        if name not in points or points[name][3] < min_visibility:
            return False
    return True


def load_model(path: Path | None = None) -> dict:
    path = path or (MODELS_DIR / "turtleneck_model.json")
    if not path.exists():
        raise FileNotFoundError(
            f"모델이 없습니다: {path}\n먼저 train.ipynb 로 학습해 모델을 만드세요."
        )
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def sigmoid(z: float) -> float:
    return 1.0 / (1.0 + math.exp(-z))


def predict_prob(feats: dict, model: dict) -> float:
    """표준화 후 로지스틱 회귀 — JS 추론과 동일한 계산.

    z = Σ coef_i * (f_i - mean_i) / std_i + intercept
    prob = sigmoid(z)
    """
    z = model["intercept"]
    for name, mean, std, coef in zip(
        model["feature_order"], model["mean"], model["std"], model["coef"]
    ):
        z += coef * (feats[name] - mean) / std
    return sigmoid(z)


def landmarks_to_points(landmark, width: int, height: int) -> dict:
    """MediaPipe 결과 → {이름: [x_px, y_px, z_px, visibility]} (extract.py와 동일)."""
    points = {}
    for name in LANDMARK_NAMES:
        p = landmark[POSE_LANDMARKS[name]]
        points[name] = [p.x * width, p.y * height, p.z * width, p.visibility]
    return points


def classify_level(prob: float, levels: dict) -> tuple[str, tuple]:
    """확률 → 3단계 라벨·색(BGR).

    prob < warning → 정상(초록), warning~severe → 주의(주황), >= severe → 심각(빨강)
    """
    warning = levels.get("warning", 0.4)
    severe = levels.get("severe", 0.7)
    if prob >= severe:
        return "SEVERE", (0, 0, 255)  # 빨강
    if prob >= warning:
        return "WARNING", (0, 165, 255)  # 주황
    return "GOOD POSTURE", (0, 200, 0)  # 초록


def draw_overlay(frame, points, smoothed_prob, levels):
    """예측 결과와 사용 랜드마크를 화면에 표시 (3단계)."""
    # 사용하는 랜드마크 점 찍기
    for name in LANDMARK_NAMES:
        x, y = int(points[name][0]), int(points[name][1])
        cv2.circle(frame, (x, y), 4, (0, 200, 255), -1)

    label, color = classify_level(smoothed_prob, levels)

    cv2.rectangle(frame, (10, 10), (360, 90), (0, 0, 0), -1)
    cv2.putText(
        frame, label, (20, 45), cv2.FONT_HERSHEY_SIMPLEX, 1.0, color, 2
    )
    cv2.putText(
        frame,
        f"turtle-neck prob: {smoothed_prob:.2f}",
        (20, 78),
        cv2.FONT_HERSHEY_SIMPLEX,
        0.6,
        (255, 255, 255),
        1,
    )

    # 확률 막대 (주의/심각 경계선 표시)
    bar_w = int(340 * smoothed_prob)
    cv2.rectangle(frame, (10, 95), (350, 110), (80, 80, 80), 1)
    cv2.rectangle(frame, (10, 95), (10 + bar_w, 110), color, -1)
    for edge in (levels.get("warning", 0.4), levels.get("severe", 0.7)):
        ex = 10 + int(340 * edge)
        cv2.line(frame, (ex, 93), (ex, 112), (255, 255, 255), 1)


def main():
    parser = argparse.ArgumentParser(description="웹캠 실시간 거북목 판별")
    parser.add_argument("--camera", type=int, default=0, help="카메라 번호")
    parser.add_argument(
        "--smooth", type=int, default=10, help="확률 스무딩 프레임 수"
    )
    args = parser.parse_args()

    model = load_model()
    levels = model.get("levels", {"warning": 0.4, "severe": 0.7})
    prob_history = deque(maxlen=args.smooth)

    # Windows에서 카메라 빠르게 열기
    cap = cv2.VideoCapture(args.camera, cv2.CAP_DSHOW)
    if not cap.isOpened():
        raise RuntimeError(f"카메라를 열 수 없습니다 (camera={args.camera})")

    print("웹캠 실행 중 — 창에서 q 키로 종료")

    with mp_pose.Pose(
        static_image_mode=False,
        model_complexity=1,
        min_detection_confidence=0.5,
        min_tracking_confidence=0.5,
    ) as pose:
        while True:
            ok, frame = cap.read()
            if not ok:
                break

            h, w = frame.shape[:2]
            rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            result = pose.process(rgb)

            if result.pose_landmarks:
                points = landmarks_to_points(result.pose_landmarks.landmark, w, h)
                if points_visible(points):
                    feats = compute_features(points)
                    if feats is not None:
                        prob = predict_prob(feats, model)
                        prob_history.append(prob)
                        smoothed = sum(prob_history) / len(prob_history)
                        draw_overlay(frame, points, smoothed, levels)
                    else:
                        cv2.putText(frame, "no features", (20, 45),
                                    cv2.FONT_HERSHEY_SIMPLEX, 1.0, (0, 165, 255), 2)
                else:
                    cv2.putText(frame, "landmarks not visible", (20, 45),
                                cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 165, 255), 2)
            else:
                cv2.putText(frame, "no person detected", (20, 45),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 165, 255), 2)

            cv2.imshow("Turtle-neck detector (press q to quit)", frame)
            if cv2.waitKey(1) & 0xFF == ord("q"):
                break

    cap.release()
    cv2.destroyAllWindows()


if __name__ == "__main__":
    main()
