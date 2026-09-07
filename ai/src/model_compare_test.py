# 모델 비교 테스트 — ai/models 의 후보를 저장된 라벨 데이터로 채점해 순위를 낸다.
#
# 실행:
#   python ai/src/model_compare_test.py
#   python ai/src/model_compare_test.py --only turtleneck
#   python ai/src/model_compare_test.py --data data/landmarks
#
# 웹캠으로 직접 확인하려면 model_live_test.py 를 쓴다. 이쪽은 "숫자상 어느 게 나은가",
# 그쪽은 "내 자리에서 어떻게 움직이나"를 본다.
#
# 라운드숄더는 제외한다 — 판정 자체를 걷어냈다.
# 의존성 없음(표준 라이브러리만). 학습 환경 없이도 돌아가야 하는 스크립트다.
#
# ⚠ 여기 나오는 점수는 상한이다.
#   후보 대부분이 이 데이터로 학습됐으므로 자기 답안지로 채점하는 셈이다. 그래서 전체 F1
#   보다 **사람별 F1 의 최솟값**을 봐야 한다. 한 사람에게만 맞는 모델은 전체 점수가 높아도
#   최솟값이 무너지고, 처음 보는 사용자에게 어떨지는 그쪽이 말해 준다.
import argparse
import csv
import json
import math
import sys
from collections import defaultdict
from pathlib import Path

AI_ROOT = Path(__file__).resolve().parent.parent
MODELS_DIR = AI_ROOT / "models"
BACKEND_MODELS_DIR = AI_ROOT.parent / "backend" / "src" / "main" / "resources" / "models"

MODEL_PREFIX_TO_LABEL = {
    "turtleneck": "forward_head",
    "shoulder_tilt": "shoulder_tilt",
}
LABEL_KO = {"forward_head": "거북목", "shoulder_tilt": "어깨 높낮이"}

LANDMARK_NAMES = [
    "nose", "left_eye", "right_eye", "left_ear", "right_ear",
    "left_shoulder", "right_shoulder",
]
MIN_VISIBILITY = 0.5


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


AVAILABLE_FEATURES = set(compute_features(
    {n: [i * 1.0, i * 2.0, i * 0.5, 1.0] for i, n in enumerate(LANDMARK_NAMES, 1)}
))


def load_dataset(data_dir):
    files = sorted(data_dir.glob("*.csv"))
    if not files:
        sys.exit(f"[중단] {data_dir} 에 CSV 가 없습니다.")

    rows = []
    for path in files:
        with path.open(encoding="utf-8-sig", newline="") as f:
            reader = csv.DictReader(f)
            if reader.fieldnames is None or "person" not in reader.fieldnames:
                print(f"  건너뜀 {path.name} — person 열 없음(옛 형식)")
                continue
            labels_here = [l for l in MODEL_PREFIX_TO_LABEL.values() if l in reader.fieldnames]
            for r in reader:
                pts, ok = {}, True
                for n in LANDMARK_NAMES:
                    try:
                        pts[n] = [float(r[f"{n}_x"]), float(r[f"{n}_y"]),
                                  float(r[f"{n}_z"]), float(r[f"{n}_v"])]
                    except (KeyError, TypeError, ValueError):
                        ok = False
                        break
                if not ok or any(pts[n][3] < MIN_VISIBILITY for n in LANDMARK_NAMES):
                    continue
                feats = compute_features(pts)
                if feats is None:
                    continue
                feats["person"] = r["person"]
                # delta 모델의 기준선을 만들 때 "이 사람의 평소 자세" 프레임만 골라야 한다.
                feats["_source"] = path.stem
                for label in labels_here:
                    feats[label] = int(r[label])
                rows.append(feats)

    if not rows:
        sys.exit("[중단] 유효한 샘플이 없습니다.")
    return rows


def _median(values):
    ordered = sorted(values)
    n = len(ordered)
    return ordered[n // 2] if n % 2 else (ordered[n // 2 - 1] + ordered[n // 2]) / 2


def build_baselines(rows, label):
    """사람별 기준선(평소 바른 자세의 피처 중앙값). delta 모델을 공정하게 채점하는 데 쓴다.

    delta 모델은 절대값이 아니라 "내 평소 자세 대비 얼마나 달라졌나"로 학습됐다. 기준선 없이
    절대값을 넣으면 아예 다른 값을 먹이는 셈이라 점수가 무의미하게 낮게 나온다.

    기준선은 파일명에 'good' 이 든 녹화분에서 만든다. 그게 실제 캘리브레이션과 같은 상황이다.
    없으면 그 자세 라벨이 0인 프레임으로 대신하는데, 그쪽은 다른 자세가 섞여 있어(예: 어깨만
    기울인 녹화는 거북목 라벨이 0이다) 기준선이 흐려진다.
    """
    by_person = defaultdict(list)
    for r in rows:
        if "good" in r["_source"]:
            by_person[r["person"]].append(r)
    for r in rows:
        if not by_person[r["person"]] and r.get(label) == 0:
            by_person[r["person"]].append(r)

    keys = [k for k in rows[0] if not k.startswith("_") and k not in ("person",)
            and k not in MODEL_PREFIX_TO_LABEL.values()]
    return {p: {k: _median([s[k] for s in group]) for k in keys}
            for p, group in by_person.items() if group}


# ── 추론 ────────────────────────────────────────────────────
def probability(model, row, baseline=None):
    """backend LogisticPostureModel.probability() 와 같은 식.

    baseline 을 주면 feature_mode=delta 모델처럼 기준선을 뺀 값을 넣는다.
    ⚠ 지금 백엔드는 feature_mode 를 읽지 않는다(@JsonIgnoreProperties). delta 모델을 서버에
      그대로 넣으면 절대값이 들어가 조용히 틀린 확률이 나온다.
    """
    delta = baseline is not None and model.get("feature_mode") == "delta"
    z = model["intercept"]
    for name, mean, std, coef in zip(
        model["feature_order"], model["mean"], model["std"], model["coef"]
    ):
        v = row[name] - baseline[name] if delta else row[name]
        z += coef * ((v - mean) / (std if std else 1.0))
    return 1.0 / (1.0 + math.exp(-z))


def score(pairs):
    """pairs: [(정답, 예측)] → 지표. accuracy 만 보면 안 되는 이유는 아래 요약 참고."""
    tp = sum(1 for t, p in pairs if t == 1 and p == 1)
    fp = sum(1 for t, p in pairs if t == 0 and p == 1)
    fn = sum(1 for t, p in pairs if t == 1 and p == 0)
    tn = sum(1 for t, p in pairs if t == 0 and p == 0)
    prec = tp / (tp + fp) if tp + fp else 0.0
    rec = tp / (tp + fn) if tp + fn else 0.0
    f1 = 2 * prec * rec / (prec + rec) if prec + rec else 0.0
    acc = (tp + tn) / len(pairs) if pairs else 0.0
    return {"f1": f1, "precision": prec, "recall": rec, "accuracy": acc,
            "tp": tp, "fp": fp, "fn": fn, "tn": tn}


def evaluate(model, rows, label, baselines=None):
    thr = model.get("threshold", 0.5)
    pairs, by_person = [], defaultdict(list)
    for r in rows:
        if label not in r:
            continue
        base = baselines.get(r["person"]) if baselines else None
        # 기준선을 못 만든 사람은 delta 모델로 채점할 수 없다. 절대값으로 대신하면 그 사람만
        # 다른 방식으로 채점되어 사람별 비교가 깨진다.
        if model.get("feature_mode") == "delta" and base is None:
            continue
        pred = 1 if probability(model, r, base) >= thr else 0
        pairs.append((r[label], pred))
        by_person[r["person"]].append((r[label], pred))
    if not pairs:
        return None, {}
    return score(pairs), {p: score(v)["f1"] for p, v in by_person.items()}


# ── 점검 ────────────────────────────────────────────────────
def inspect(model, label):
    problems = []
    feats = model["feature_order"]

    # 라벨 누수: 피처 이름이 자기 라벨 이름과 같으면, 학습 때 피처값이 0/1 라벨로
    # 덮어써졌을 수 있다(train.ipynb 의 feats[label] = int(r[label]) 한 줄).
    if label in feats:
        problems.append(f"라벨 누수 의심 — 피처 '{label}' 가 라벨과 이름이 같다")

    missing = [f for f in feats if f not in AVAILABLE_FEATURES]
    if missing:
        problems.append(f"이 데이터로 못 만드는 피처 {len(missing)}개: {', '.join(missing)}")

    if model.get("feature_mode") == "delta":
        problems.append("feature_mode=delta — 사람별 기준선을 빼서 채점한다. "
                        "⚠ 백엔드는 feature_mode 를 읽지 않으므로 이 모델을 서버에 넣으면 "
                        "절대값이 들어가 조용히 틀린다")

    return problems, bool(missing)


def top_coefficients(model, k=3):
    pairs = sorted(zip(model["feature_order"], model["coef"]), key=lambda x: -abs(x[1]))[:k]
    return ", ".join(f"{n} {c:+.2f}" for n, c in pairs)


def load_models(only):
    out = []
    for path in sorted(MODELS_DIR.glob("*.json")):
        stem = path.stem
        if "rounded_shoulder" in stem:
            continue  # 판정에서 걷어낸 자세
        label = next((v for k, v in MODEL_PREFIX_TO_LABEL.items() if stem.startswith(k)), None)
        if label is None:
            print(f"  건너뜀 {path.name} — 어느 자세용인지 파일명으로 알 수 없음")
            continue
        if only and only not in stem:
            continue
        out.append((path.name, json.loads(path.read_text(encoding="utf-8")), label))
    return out


def backend_copy_note(name, model):
    """지금 서버가 무엇을 쓰고 있는지."""
    path = BACKEND_MODELS_DIR / name
    if not path.exists():
        return "서버에 같은 이름의 사본 없음"
    server = json.loads(path.read_text(encoding="utf-8"))
    if server["coef"] == model["coef"] and server["feature_order"] == model["feature_order"]:
        return "★ 지금 서버가 쓰는 모델과 동일"
    return (f"서버 사본과 다름 — 서버는 피처 {len(server['feature_order'])}개, "
            f"1위 {top_coefficients(server, 1)}")


def main():
    ap = argparse.ArgumentParser(description="ai/models 후보 비교 (라운드숄더 제외)")
    ap.add_argument("--data", default="data/landmarks_6people",
                    help="라벨 CSV 폴더 (기본: data/landmarks_6people)")
    ap.add_argument("--only", default="", help="파일명에 이 문자열이 든 모델만")
    args = ap.parse_args()

    data_dir = AI_ROOT / args.data
    print(f"데이터: {data_dir}")
    rows = load_dataset(data_dir)
    persons = sorted({r["person"] for r in rows})
    print(f"  샘플 {len(rows)}개 · 사람 {len(persons)}명 ({', '.join(map(str, persons))})")
    for label, ko in LABEL_KO.items():
        have = [r for r in rows if label in r]
        if have:
            pos = sum(r[label] for r in have)
            print(f"  {ko}: 양성 {pos} / 음성 {len(have) - pos}")
    print()

    models = load_models(args.only)
    if not models:
        sys.exit("[중단] 평가할 모델이 없습니다.")

    # delta 모델용 사람별 기준선. 자세마다 "평소"의 기준이 달라서 라벨별로 따로 만든다.
    baselines = {label: build_baselines(rows, label) for label in LABEL_KO}
    for label, ko in LABEL_KO.items():
        print(f"  {ko} 기준선: {len(baselines[label])}명분")
    print()

    results = []
    for name, model, label in models:
        print(f"── {name}  [{LABEL_KO[label]}]")
        print(f"   피처 {len(model['feature_order'])}개 · 임계값 {model.get('threshold', 0.5)}")
        print(f"   큰 계수: {top_coefficients(model)}")
        print(f"   {backend_copy_note(name, model)}")

        problems, unusable = inspect(model, label)
        for p in problems:
            print(f"   ⚠ {p}")
        if unusable:
            print("   → 평가 건너뜀\n")
            continue
        if not any(label in r for r in rows):
            print(f"   → 데이터에 {label} 라벨이 없어 건너뜀\n")
            continue

        overall, per_person = evaluate(model, rows, label, baselines.get(label))
        if overall is None:
            print("   → 기준선을 만들 수 있는 사람이 없어 건너뜀\n")
            continue
        worst_person = min(per_person, key=per_person.get)
        worst = per_person[worst_person]
        print(f"   F1 {overall['f1']:.3f} (정밀도 {overall['precision']:.3f} / "
              f"재현율 {overall['recall']:.3f} / 정확도 {overall['accuracy']:.3f})")
        print(f"   오답: 놓침 {overall['fn']}건, 헛경고 {overall['fp']}건")
        print("   사람별 F1: " + "  ".join(f"{p}={v:.2f}" for p, v in sorted(per_person.items())))
        print(f"   ★ 최악의 사람: {worst_person} = {worst:.3f}\n")

        results.append({
            "model": name, "ko": LABEL_KO[label], "f1": overall["f1"], "worst": worst,
            "prec": overall["precision"], "rec": overall["recall"],
            "leak": label in model["feature_order"],
            "delta": model.get("feature_mode") == "delta",
        })

    if not results:
        return

    print("=" * 78)
    print("요약 — 사람별 최소 F1 이 높은 것이 처음 보는 사용자에게 강하다")
    print("=" * 78)
    for ko in dict.fromkeys(r["ko"] for r in results):
        part = sorted((r for r in results if r["ko"] == ko),
                      key=lambda r: r["worst"], reverse=True)
        print(f"\n[{ko}]")
        print(f"  {'모델':<28}{'최소F1':>8}{'전체F1':>8}{'정밀도':>8}{'재현율':>8}  비고")
        for r in part:
            note = " ".join(x for x in ("누수의심" if r["leak"] else "",
                                        "delta" if r["delta"] else "") if x)
            print(f"  {r['model']:<28}{r['worst']:>8.3f}{r['f1']:>8.3f}"
                  f"{r['prec']:>8.3f}{r['rec']:>8.3f}  {note}")
        deployable = [r for r in part if not r["leak"] and not r["delta"]]
        if part[0]["delta"] and deployable:
            print(f"  → 점수 1위는 {part[0]['model']} 인데 delta 모델이라 지금 서버에 못 넣는다"
                  " (백엔드가 feature_mode 를 읽지 않는다).")
            print(f"     바로 넣을 수 있는 것 중 1위: {deployable[0]['model']}")
        elif deployable:
            print(f"  → 추천: {deployable[0]['model']}")
        else:
            print("  → 바로 넣을 수 있는 후보가 없다. 누수 의심은 재학습, delta 는 서버 지원이 필요하다.")

    print("\n반영:  cp ai/models/<고른파일> backend/src/main/resources/models/")
    print("       그 뒤 HybridPostureDetectorTest 의 기대 확률도 새로 뽑아 갱신해야 한다.")


if __name__ == "__main__":
    main()
