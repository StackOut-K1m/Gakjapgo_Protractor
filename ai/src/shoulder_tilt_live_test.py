"""어깨 높낮이 모델을 캘리브레이션 + 실시간 웹캠으로 검증한다.

model_live_test.py 는 여러 자세의 모델을 나란히 보여주는 범용 도구다. 어깨 높낮이는 그것으로
부족해서 따로 만들었다 — 이 자세에만 있는 함정이 셋이다.

1) 방향
   로지스틱 회귀는 선형이라 부호 있는 값 하나로는 "어느 쪽으로 기울든 나쁨"을 표현할 수 없다.
   왼쪽 기울기를 나쁨으로 배우는 순간 오른쪽 기울기는 "아주 좋은 자세"가 된다. 그래서 학습에
   abs_shoulder_tilt 를 넣었는데, 정말 양쪽이 대칭으로 잡히는지는 **양쪽을 다 해 봐야** 안다.
   이 스크립트는 좌·우 각각의 최고 확률을 따로 기록해 비대칭을 드러낸다.

2) 몸통 회전
   몸을 틀기만 해도 좌우 어깨 높이가 달라진다. 서버는 그래서 회전이 크면 어깨 판정을 아예
   보류한다(max-torso-rotation). 이 보류가 실제로 언제 걸리는지 화면에서 보여준다.

3) 규칙 기반과의 어긋남
   하이브리드는 각도와 보류를 규칙 기반이 정하고 심각도만 모델이 정한다. 둘이 다르게 보는
   프레임이 있으면 그게 이 자세에서 가장 헷갈리는 지점이라, 나란히 띄운다.

실행:
    python ai/src/shoulder_tilt_live_test.py
    python ai/src/shoulder_tilt_live_test.py --camera 1

키:
    q  종료
    r  캘리브레이션 다시
    c  좌·우 최고 확률 기록 지우기
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

CALIB_SECONDS = 5.0
SMOOTH_FRAMES = 5
MIN_VISIBILITY = 0.5

# 학습(train.ipynb)·프론트와 같은 등급이어야 z(깊이)가 맞는다.
POSE_MODEL_COMPLEXITY = 2

# backend application.yml 과 같은 값들.
SEVERITY_PROBABILITIES = [0.40, 0.55, 0.70, 0.85, 0.95]
SEVERITY_DEGREES = [2, 4, 6, 8, 10]   # 규칙 기반 어깨 높낮이 경계(도)
MAX_TORSO_ROTATION = 0.35             # 이보다 크면 서버가 어깨 판정을 보류한다
ALERT_SEVERITY = 1                    # 이 심각도부터 경고로 센다

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
        "shoulder_tilt": tilt,
        "shoulder_tilt_signed": tilt,
        "shoulder_z_rel": -nose_z_rel,
        # ↓ 모델이 쓰지 않는 진단용 값. 규칙 기반 판정과 보류 조건을 재현한다.
        #   부호가 위 shoulder_tilt 와 반대다 — 서버 v1 계약(shoulderTiltRatio)이 그렇게 정의돼
        #   있고, 규칙 기반 각도는 그 값으로 계산되기 때문이다.
        "_v1_tilt": (ls[1] - rs[1]) / shoulder_width,
        "_torso_rotation": abs(_dist(nose, ls) - _dist(nose, rs)) / shoulder_width,
    }


AVAILABLE = set(compute_features(
    {n: [i * 1.0, i * 2.0, i * 0.5, 1.0] for i, n in enumerate(LANDMARK_NAMES, 1)}
))


def extract_points(landmarks, width, height):
    pts = {}
    for name, idx in LM.items():
        lm = landmarks[idx]
        # z 는 어깨 너비를 1 로 보는 상대 깊이라 x 와 같은 축척(width)을 쓴다.
        pts[name] = [lm.x * width, lm.y * height, lm.z * width, lm.visibility]
    return pts


# ── 판정 ────────────────────────────────────────────────────
def probability(model, feats, baseline):
    delta = model.get("feature_mode") == "delta"
    z = model["intercept"]
    for name, mean, std, coef in zip(
        model["feature_order"], model["mean"], model["std"], model["coef"]
    ):
        v = feats[name] - baseline[name] if delta else feats[name]
        z += coef * ((v - mean) / (std if std else 1.0))
    return 1.0 / (1.0 + math.exp(-z))


def level_from(value, boundaries):
    level = 0
    for boundary in boundaries:
        if value < boundary:
            break
        level += 1
    return level


def rule_based(feats, baseline):
    """규칙 기반 어깨 높낮이. RuleBasedPostureDetector.judgeShoulderTilt 와 같은 계산."""
    if feats["_torso_rotation"] > MAX_TORSO_ROTATION:
        return None, "TORSO_ROTATED"
    current = math.degrees(math.atan(feats["_v1_tilt"]))
    base = math.degrees(math.atan(baseline["_v1_tilt"]))
    deviation = abs(current - base)
    return deviation, None


def load_models():
    out, skipped = [], []
    for path in sorted(MODELS_DIR.glob("shoulder_tilt_model*.json")):
        model = json.loads(path.read_text(encoding="utf-8"))
        missing = [f for f in model["feature_order"] if f not in AVAILABLE]
        if missing:
            skipped.append((path.name, missing))
            continue
        model["_name"] = path.name
        model["_delta"] = model.get("feature_mode") == "delta"
        model["_on_server"] = _same_as_server(path.name, model)
        out.append(model)
    return out, skipped


def _same_as_server(name, model):
    # 서버는 파일명이 무엇이든 shoulder_tilt_model.json 하나만 읽는다(application.yml).
    path = BACKEND_MODELS_DIR / "shoulder_tilt_model.json"
    if not path.exists():
        return False
    server = json.loads(path.read_text(encoding="utf-8"))
    return server["coef"] == model["coef"] and server["feature_order"] == model["feature_order"]


# ── 화면 ────────────────────────────────────────────────────
def light(level):
    if level >= ALERT_SEVERITY:
        return (60, 60, 240)      # 빨강 — 이 심각도부터 경고로 센다
    return (100, 200, 100)        # 초록


def draw(frame, models, probs, feats, baseline, best, show_feats):
    x, y = 14, 30
    cv2.putText(frame, "SHOULDER TILT (calibrated)", (x, y),
                cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 2)

    # ── 규칙 기반: 각도와 보류 ──
    y += 28
    if feats is None:
        cv2.putText(frame, "cannot see face/shoulders", (x, y),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.55, (60, 60, 240), 1)
        return

    deviation, skip = rule_based(feats, baseline)
    if skip:
        cv2.putText(frame, f"rule-based: SKIP ({skip})  rotation "
                           f"{feats['_torso_rotation']:.2f} > {MAX_TORSO_ROTATION}",
                    (x, y), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (60, 200, 240), 1)
    else:
        rule_level = level_from(deviation, SEVERITY_DEGREES)
        cv2.putText(frame, f"rule-based: {deviation:5.2f}deg  sev{rule_level}"
                           f"   rotation {feats['_torso_rotation']:.2f}",
                    (x, y), cv2.FONT_HERSHEY_SIMPLEX, 0.5, light(rule_level), 1)

    # ── 지금 어느 쪽으로 기울었나 ──
    y += 22
    signed = feats["_v1_tilt"] - baseline["_v1_tilt"]
    side = "LEFT-DOWN" if signed > 0 else "RIGHT-DOWN"
    cv2.putText(frame, f"tilt vs baseline: {signed:+.3f}  ({side})", (x, y),
                cv2.FONT_HERSHEY_SIMPLEX, 0.5, (200, 200, 200), 1)

    # ── 모델별 ──
    for model in models:
        name = model["_name"]
        y += 24
        prob = probs.get(name)
        if prob is None:
            continue
        level = level_from(prob, SEVERITY_PROBABILITIES)
        tag = " [delta]" if model["_delta"] else ""
        tag += " *SERVER" if model["_on_server"] else ""
        cv2.putText(frame, f"{name[:24]:<24} {prob:.2f} sev{level}{tag}", (x, y),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.45, light(level), 1)
        bx = x + 330
        cv2.rectangle(frame, (bx, y - 10), (bx + 110, y - 1), (70, 70, 70), -1)
        cv2.rectangle(frame, (bx, y - 10), (bx + int(110 * prob), y - 1), light(level), -1)

    # ── 좌·우 최고 확률 (대칭성) ──
    y += 30
    cv2.putText(frame, "max prob by direction  (press c to clear)", (x, y),
                cv2.FONT_HERSHEY_SIMPLEX, 0.45, (200, 200, 255), 1)
    for model in models:
        name = model["_name"]
        y += 20
        left, right = best[name]["left"], best[name]["right"]
        gap = abs(left - right)
        # 한쪽만 잡히면 abs_shoulder_tilt 가 제 역할을 못 하고 있다는 신호다.
        warn = (60, 60, 240) if gap > 0.25 else (180, 180, 180)
        cv2.putText(frame, f"{name[:24]:<24} L {left:.2f}   R {right:.2f}   gap {gap:.2f}",
                    (x, y), cv2.FONT_HERSHEY_SIMPLEX, 0.42, warn, 1)

    if show_feats:
        y += 26
        for key in ("shoulder_tilt_signed", "abs_shoulder_tilt", "shoulder_z_spread",
                    "head_roll", "abs_head_roll", "_v1_tilt", "_torso_rotation"):
            y += 18
            cv2.putText(frame, f"{key:<22}{feats[key]:+.4f}   (base {baseline[key]:+.4f})",
                        (x, y), cv2.FONT_HERSHEY_SIMPLEX, 0.4, (180, 180, 180), 1)


def main():
    ap = argparse.ArgumentParser(description="어깨 높낮이 모델 실시간 검증")
    ap.add_argument("--camera", type=int, default=0)
    args = ap.parse_args()

    models, skipped = load_models()
    for name, missing in skipped:
        print(f"제외 {name} — 못 만드는 피처: {', '.join(missing)}")
    if not models:
        sys.exit("[중단] shoulder_tilt_model*.json 을 찾지 못했습니다.")
    print(f"비교 대상 {len(models)}개")
    for m in models:
        print(f"  {m['_name']}"
              + ("  [delta]" if m["_delta"] else "")
              + ("  *서버가 쓰는 것" if m["_on_server"] else ""))
    print("""
확인 순서
  1. 바른 자세로 5초 캘리브레이션
  2. 왼쪽 어깨를 내려 본다  → L 최고 확률이 오른다
  3. 오른쪽 어깨를 내려 본다 → R 최고 확률이 오른다
  4. L 과 R 의 gap 이 크면(0.25 이상 빨갛게 표시) 그 모델은 한쪽만 잡는다
  5. 몸을 좌우로 틀어 본다  → rule-based 가 SKIP(TORSO_ROTATED) 으로 바뀌는지

q 종료 · r 캘리브레이션 다시 · c 기록 지우기 · f 피처값
""")

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
    best = {m["_name"]: {"left": 0.0, "right": 0.0} for m in models}

    while True:
        ok, frame = cap.read()
        if not ok:
            break
        h, w = frame.shape[:2]

        # 판정은 원본으로. train.ipynb 추출 루프가 뒤집지 않으므로 여기서 뒤집으면
        # 좌우가 바뀌어 부호 있는 피처(shoulder_tilt_signed·head_roll)가 반대로 들어간다.
        result = pose.process(cv2.cvtColor(frame, cv2.COLOR_BGR2RGB))
        frame = cv2.flip(frame, 1)  # 화면만 거울

        feats = None
        if result.pose_landmarks:
            pts = extract_points(result.pose_landmarks.landmark, w, h)
            if all(pts[n][3] >= MIN_VISIBILITY for n in LANDMARK_NAMES):
                raw = compute_features(pts)
                if raw is not None:
                    smoothing.append(raw)
                    feats = {k: float(np.mean([s[k] for s in smoothing])) for k in raw}

        if baseline is None:
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
                    print(f"  어깨 기울기(v1) {baseline['_v1_tilt']:+.4f} "
                          f"= {math.degrees(math.atan(baseline['_v1_tilt'])):+.2f}도")
                    print(f"  몸통 회전       {baseline['_torso_rotation']:.4f}\n")
            else:
                cv2.putText(frame, f"CALIBRATING {remain:.1f}s", (14, 30),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.7, (60, 200, 240), 2)
                cv2.putText(frame, "sit straight, shoulders level, face the camera",
                            (14, 58), cv2.FONT_HERSHEY_SIMPLEX, 0.55, (255, 255, 255), 1)
        else:
            probs = {}
            if feats is not None:
                for model in models:
                    p = probability(model, feats, baseline)
                    probs[model["_name"]] = p
                    signed = feats["_v1_tilt"] - baseline["_v1_tilt"]
                    # 기준선 근처(거의 수평)는 어느 쪽도 아니라 기록하지 않는다.
                    if abs(signed) > 0.02:
                        side = "left" if signed > 0 else "right"
                        best[model["_name"]][side] = max(best[model["_name"]][side], p)
            draw(frame, models, probs, feats, baseline, best, show_feats)

        cv2.putText(frame, "q: quit   r: recalibrate   c: clear   f: features",
                    (14, h - 18), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (200, 200, 200), 1)
        cv2.imshow("shoulder tilt live test (q: quit)", frame)

        key = cv2.waitKey(1) & 0xFF
        if key == ord("q"):
            break
        if key == ord("r"):
            baseline = None
            calib_samples.clear()
            smoothing.clear()
            calib_started = time.time()
            print("캘리브레이션 다시 시작")
        if key == ord("c"):
            for v in best.values():
                v["left"] = v["right"] = 0.0
        if key == ord("f"):
            show_feats = not show_feats

    cap.release()
    cv2.destroyAllWindows()
    pose.close()


if __name__ == "__main__":
    main()
