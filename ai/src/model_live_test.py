"""후보 모델을 캘리브레이션 + 실시간 웹캠으로 비교한다.

model_compare_test.py 는 저장된 CSV 로 채점한다. 그건 "숫자상 어느 게 낫나"는 알려주지만
내 웹캠·내 자리에서 어떻게 동작하는지는 알려주지 않는다. 이 스크립트는 그 반대다 —
직접 캘리브레이션을 찍고, 자세를 바꿔 가며 **여러 모델의 확률이 동시에 어떻게 움직이는지**
한 화면에서 본다.

왜 캘리브레이션이 필요한가
    후보 중 일부는 feature_mode=delta 로 학습됐다. 절대값이 아니라 "내 평소 자세 대비 얼마나
    달라졌나"를 입력으로 받는 모델이라, 기준선 없이는 아예 다른 값을 먹이는 셈이 된다.
    절대값 모델은 기준선을 안 쓰지만, 같은 화면에서 비교하려면 한 번에 재 두는 편이 낫다.

라운드숄더 모델은 제외한다 — 판정 자체를 걷어냈다.

실행:
    python ai/src/model_live_test.py
    python ai/src/model_live_test.py --only turtleneck
    python ai/src/model_live_test.py --camera 1

키:
    q  종료
    r  캘리브레이션 다시
    f  피처 원값 표시 켜기/끄기
"""

import argparse
import json
import math
import sys
import time
from collections import deque
from pathlib import Path

import cv2
import mediapipe as mp
import numpy as np

AI_ROOT = Path(__file__).resolve().parent.parent
MODELS_DIR = AI_ROOT / "models"
BACKEND_MODELS_DIR = AI_ROOT.parent / "backend" / "src" / "main" / "resources" / "models"

CALIB_SECONDS = 5.0      # 기준선(평소 바른 자세)을 재는 시간
SMOOTH_FRAMES = 5        # 피처 이동평균 — 랜드마크 떨림 완화
MIN_VISIBILITY = 0.5

# BlazePose 등급. 2=heavy — 학습(train.ipynb POSE_MODEL_COMPLEXITY)과 프론트가 쓰는 것과
# 같아야 한다. 등급이 다르면 z(깊이)가 달라져 z 기반 피처가 통째로 어긋난다.
POSE_MODEL_COMPLEXITY = 2

# 확률 → 심각도 1~5. backend application.yml 의 severity-probabilities 와 같은 값.
SEVERITY_PROBABILITIES = [0.40, 0.55, 0.70, 0.85, 0.95]

MODEL_PREFIX_TO_LABEL = {
    "turtleneck": "forward_head",
    "shoulder_tilt": "shoulder_tilt",
}
LABEL_EN = {"forward_head": "FORWARD HEAD", "shoulder_tilt": "SHOULDER TILT"}

LM = {
    "nose": 0,
    "left_eye": 2, "right_eye": 5,
    "left_ear": 7, "right_ear": 8,
    "left_shoulder": 11, "right_shoulder": 12,
}
LANDMARK_NAMES = list(LM)


# ── 피처 (train.ipynb compute_features 와 같은 정의) ──────────
def _dist(a, b):
    return math.hypot(a[0] - b[0], a[1] - b[1])


def _mid(a, b):
    return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2]


def compute_features(p):
    nose = p["nose"]
    le, re = p["left_eye"], p["right_eye"]
    lear, rear = p["left_ear"], p["right_ear"]
    ls, rs = p["left_shoulder"], p["right_shoulder"]

    shoulder_width = _dist(ls, rs)
    eye_dist = _dist(le, re)
    if shoulder_width < 1e-6 or eye_dist < 1e-6:
        return None

    smid, emid = _mid(ls, rs), _mid(lear, rear)
    ear_dy = emid[1] - smid[1]
    ear_dz = emid[2] - smid[2]
    head_roll = (re[1] - le[1]) / eye_dist
    tilt = (rs[1] - ls[1]) / shoulder_width
    nose_z_rel = (nose[2] - smid[2]) / shoulder_width

    return {
        "eye_dist_ratio": eye_dist / shoulder_width,
        "ear_dist_ratio": _dist(lear, rear) / shoulder_width,
        "nose_above_shoulder": (smid[1] - nose[1]) / shoulder_width,
        "ear_above_shoulder": (smid[1] - emid[1]) / shoulder_width,
        "nose_z_rel": nose_z_rel,
        "ear_z_rel": ear_dz / shoulder_width,
        "acromion_proxy": math.hypot(ear_dy, ear_dz) / shoulder_width,
        "head_roll": head_roll,
        "abs_head_roll": abs(head_roll),
        "abs_shoulder_tilt": abs(tilt),
        "shoulder_z_spread": abs(ls[2] - rs[2]) / shoulder_width,
        # 같은 값의 두 이름. 라벨 누수를 고치며 shoulder_tilt -> shoulder_tilt_signed 로
        # 바뀌었는데 옛 모델 파일은 여전히 옛 이름을 쓴다.
        "shoulder_tilt": tilt,
        "shoulder_tilt_signed": tilt,
        "shoulder_z_rel": -nose_z_rel,
    }


AVAILABLE = set(compute_features(
    {n: [i * 1.0, i * 2.0, i * 0.5, 1.0] for i, n in enumerate(LANDMARK_NAMES, 1)}
))


def extract_points(landmarks, width, height):
    """정규화 좌표를 픽셀로. 학습 때 CSV 가 픽셀이었으므로 같은 축척을 쓴다."""
    pts = {}
    for name, idx in LM.items():
        lm = landmarks[idx]
        # z 는 어깨 너비를 1 로 보는 상대 깊이라 x 와 같은 축척(width)을 쓴다.
        pts[name] = [lm.x * width, lm.y * height, lm.z * width, lm.visibility]
    return pts


def points_visible(pts):
    return all(pts[n][3] >= MIN_VISIBILITY for n in LANDMARK_NAMES)


# ── 모델 ────────────────────────────────────────────────────
def probability(model, feats, baseline):
    """backend LogisticPostureModel.probability() 와 같은 식.

    feature_mode 가 delta 면 기준선을 뺀 값을 넣는다. 그 모델은 절대값이 아니라
    "평소보다 얼마나 달라졌나"로 학습됐다.
    """
    delta = model.get("feature_mode") == "delta"
    z = model["intercept"]
    for name, mean, std, coef in zip(
        model["feature_order"], model["mean"], model["std"], model["coef"]
    ):
        v = feats[name] - baseline[name] if delta else feats[name]
        z += coef * ((v - mean) / (std if std else 1.0))
    return 1.0 / (1.0 + math.exp(-z))


def severity(prob):
    level = 0
    for boundary in SEVERITY_PROBABILITIES:
        if prob < boundary:
            break
        level += 1
    return level


def load_models(only):
    """평가 가능한 후보만 고른다. 못 만드는 피처를 요구하면 이유를 알리고 뺀다."""
    out, skipped = [], []
    for path in sorted(MODELS_DIR.glob("*.json")):
        stem = path.stem
        if "rounded_shoulder" in stem:
            continue
        label = next((v for k, v in MODEL_PREFIX_TO_LABEL.items() if stem.startswith(k)), None)
        if label is None or (only and only not in stem):
            continue
        model = json.loads(path.read_text(encoding="utf-8"))
        missing = [f for f in model["feature_order"] if f not in AVAILABLE]
        if missing:
            skipped.append((path.name, missing))
            continue
        model["_name"] = path.name
        model["_label"] = label
        model["_delta"] = model.get("feature_mode") == "delta"
        model["_on_server"] = _same_as_server(path.name, model)
        out.append(model)
    return out, skipped


def _same_as_server(name, model):
    path = BACKEND_MODELS_DIR / name
    if not path.exists():
        return False
    server = json.loads(path.read_text(encoding="utf-8"))
    return server["coef"] == model["coef"] and server["feature_order"] == model["feature_order"]


# ── 화면 ────────────────────────────────────────────────────
def bar_color(level):
    if level >= 4:
        return (60, 60, 240)     # 빨강 — 서버 alert-severity 4 와 같은 선
    if level >= 1:
        return (60, 200, 240)    # 노랑
    return (100, 200, 100)       # 초록


def draw_panel(frame, models, probs, show_feats, feats, baseline):
    x, y = 14, 30
    cv2.putText(frame, "MODEL COMPARISON (calibrated)", (x, y),
                cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 2)
    y += 10

    last_label = None
    for model in models:
        name, label = model["_name"], model["_label"]
        if label != last_label:
            y += 26
            cv2.putText(frame, LABEL_EN[label], (x, y),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.55, (200, 200, 255), 1)
            last_label = label

        y += 24
        prob = probs.get(name)
        if prob is None:
            cv2.putText(frame, f"{name[:26]:<26} --", (x, y),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.45, (150, 150, 150), 1)
            continue

        level = severity(prob)
        tag = " [delta]" if model["_delta"] else ""
        tag += " *SERVER" if model["_on_server"] else ""
        cv2.putText(frame, f"{name[:26]:<26} {prob:.2f} sev{level}{tag}", (x, y),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.45, bar_color(level), 1)
        # 확률 막대 — 숫자만 보면 모델끼리 비교가 어렵다
        bx = x + 330
        cv2.rectangle(frame, (bx, y - 10), (bx + 120, y - 1), (70, 70, 70), -1)
        cv2.rectangle(frame, (bx, y - 10), (bx + int(120 * prob), y - 1), bar_color(level), -1)

    if show_feats and feats:
        y += 30
        cv2.putText(frame, "features (now / baseline)", (x, y),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.45, (200, 200, 200), 1)
        for key in sorted(feats):
            y += 18
            base = baseline.get(key) if baseline else None
            text = (f"{key:<22}{feats[key]:+.3f}"
                    + (f"  ({base:+.3f})" if base is not None else ""))
            cv2.putText(frame, text, (x, y),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.4, (180, 180, 180), 1)


def main():
    ap = argparse.ArgumentParser(description="후보 모델 실시간 비교 (라운드숄더 제외)")
    ap.add_argument("--only", default="", help="파일명에 이 문자열이 든 모델만")
    ap.add_argument("--camera", type=int, default=0, help="웹캠 인덱스")
    args = ap.parse_args()

    models, skipped = load_models(args.only)
    for name, missing in skipped:
        print(f"제외 {name} — 이 스크립트가 못 만드는 피처: {', '.join(missing)}")
    if not models:
        sys.exit("[중단] 비교할 모델이 없습니다.")
    print(f"비교 대상 {len(models)}개")
    for m in models:
        print(f"  {m['_name']}"
              + ("  [delta]" if m["_delta"] else "")
              + ("  *서버가 쓰는 것" if m["_on_server"] else ""))
    print("\nq 종료 · r 캘리브레이션 다시 · f 피처값 표시\n")

    cap = cv2.VideoCapture(args.camera)
    if not cap.isOpened():
        sys.exit(f"[중단] 웹캠({args.camera})을 열 수 없습니다.")

    pose = mp.solutions.pose.Pose(model_complexity=POSE_MODEL_COMPLEXITY,
                                  min_detection_confidence=0.5,
                                  min_tracking_confidence=0.5)

    smoothing = deque(maxlen=SMOOTH_FRAMES)
    baseline = None
    calib_samples = []
    calib_started = time.time()
    show_feats = False

    while True:
        ok, frame = cap.read()
        if not ok:
            break
        h, w = frame.shape[:2]

        # 판정은 원본 프레임으로 한다. train.ipynb 의 추출 루프가 뒤집지 않고 좌표를 뽑으므로,
        # 여기서 뒤집으면 좌우가 바뀌어 shoulder_tilt_signed·head_roll 의 부호가 반대로 들어간다.
        # 절댓값 피처(abs_*)는 영향이 없어서 에러 없이 그럴듯하게 틀린 확률만 나온다.
        result = pose.process(cv2.cvtColor(frame, cv2.COLOR_BGR2RGB))
        # 화면만 거울처럼 뒤집는다 — 몸을 오른쪽으로 기울일 때 화면도 오른쪽이어야 조작감이 맞는다.
        frame = cv2.flip(frame, 1)
        feats = None
        if result.pose_landmarks:
            pts = extract_points(result.pose_landmarks.landmark, w, h)
            if points_visible(pts):
                raw = compute_features(pts)
                if raw is not None:
                    smoothing.append(raw)
                    feats = {k: float(np.mean([s[k] for s in smoothing])) for k in raw}

        probs = {}
        if baseline is None:
            # ── 캘리브레이션 ──
            remain = CALIB_SECONDS - (time.time() - calib_started)
            if feats is not None:
                calib_samples.append(feats)
            if remain <= 0:
                if len(calib_samples) < 10:
                    print("샘플이 너무 적습니다. 카메라 앞에 앉은 채로 다시 시작합니다.")
                    calib_samples.clear()
                    calib_started = time.time()
                else:
                    baseline = {k: float(np.median([s[k] for s in calib_samples]))
                                for k in calib_samples[0]}
                    print(f"기준선 완료 (샘플 {len(calib_samples)}개)")
                    for k in sorted(baseline):
                        print(f"  {k:<22}{baseline[k]:+.4f}")
                    print()
            else:
                cv2.putText(frame, f"CALIBRATING {remain:.1f}s", (14, 30),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.7, (60, 200, 240), 2)
                cv2.putText(frame, "sit in your BEST posture and hold still",
                            (14, 58), cv2.FONT_HERSHEY_SIMPLEX, 0.55, (255, 255, 255), 1)
                if feats is None:
                    cv2.putText(frame, "cannot see face/shoulders", (14, 84),
                                cv2.FONT_HERSHEY_SIMPLEX, 0.55, (60, 60, 240), 1)
        else:
            # ── 실시간 비교 ──
            if feats is not None:
                for model in models:
                    probs[model["_name"]] = probability(model, feats, baseline)
            else:
                cv2.putText(frame, "cannot see face/shoulders", (14, h - 44),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.55, (60, 60, 240), 1)
            draw_panel(frame, models, probs, show_feats, feats, baseline)

        cv2.putText(frame, "q: quit   r: recalibrate   f: features",
                    (14, h - 18), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (200, 200, 200), 1)
        cv2.imshow("model live test (q: quit)", frame)

        key = cv2.waitKey(1) & 0xFF
        if key == ord("q"):
            break
        if key == ord("r"):
            baseline = None
            calib_samples.clear()
            calib_started = time.time()
            smoothing.clear()
            print("캘리브레이션 다시 시작")
        if key == ord("f"):
            show_feats = not show_feats

    cap.release()
    cv2.destroyAllWindows()
    pose.close()


if __name__ == "__main__":
    main()
