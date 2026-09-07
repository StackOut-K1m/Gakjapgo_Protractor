# LLM 기반 리포트 소견 생성 프로토타입 (FR-RPT-02 · 프롬프트 실험)
#
# 사용법 (turtleneck 환경):
#   python report_llm_test.py --dry-run     # LLM 호출 없이 프롬프트 출력 + 차트만 생성
#   python report_llm_test.py               # GMS 실호출 → 소견 + 차트 + 종합 리포트(md) 생성
#
# GMS 연결: ai/.env 파일에 GMS_API_KEY (필수), GMS_MODEL / GMS_BASE_URL (선택)
#
# 설계 원칙:
#   - 수치·표·그래프는 전부 "코드"가 데이터로 생성한다. LLM은 해석 문장만 담당 (환각 방지).
#   - 그래프는 matplotlib 로 PNG 생성 → 리포트 md 에 삽입.
#     실서비스에선 이 부분이 BE 의 차트 렌더링(또는 FE recharts)에 해당.
#   - reports.prompt_version 에 대응하는 PROMPT_VERSION 을 항상 남긴다.
import argparse
import os
import sys
from datetime import datetime
from pathlib import Path

PROMPT_VERSION = "v2"


def load_env_file() -> None:
    """ai/.env 를 읽어 환경변수로 등록 (이미 설정된 값은 덮어쓰지 않음)."""
    env_path = Path(__file__).resolve().parents[2] / ".env"  # ai/.env
    if not env_path.exists():
        return
    for line in env_path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        key, value = key.strip(), value.strip()
        if key and value and key not in os.environ:
            os.environ[key] = value


load_env_file()

# ── ① 집계 데이터 (목) ─────────────────────────────────────────
MOCK_METRICS = {
    "period": {"from": "2026-07-20", "to": "2026-07-26"},
    "totalStudySeconds": 115200,
    "focusedSeconds": 92160,
    "goodPostureRatio": 87,
    "prevGoodPostureRatio": 82,
    "totalScore": 87,
    "prevTotalScore": 83,
    "focusScore": 81,
    "bodyPartScores": {"neck": 78, "shoulder": 84, "shoulderTilt": 90},
    "prevBodyPartScores": {"neck": 72, "shoulder": 83, "shoulderTilt": 88},
    "eventCounts": {"badPosture": 24, "drowsy": 6, "away": 3},
    "prevEventCounts": {"badPosture": 28, "drowsy": 9, "away": 2},
    "warningCount": 12,
    "stretchingAttemptCount": 8,
    "stretchingCompletedCount": 6,
    "dailyStats": [
        {"date": "2026-07-20", "studyMinutes": 210, "goodPostureRatio": 92},
        {"date": "2026-07-21", "studyMinutes": 120, "goodPostureRatio": 85},
        {"date": "2026-07-22", "studyMinutes": 240, "goodPostureRatio": 88},
        {"date": "2026-07-23", "studyMinutes": 90, "goodPostureRatio": 78},
        {"date": "2026-07-24", "studyMinutes": 210, "goodPostureRatio": 91},
        {"date": "2026-07-25", "studyMinutes": 0, "goodPostureRatio": None},
        {"date": "2026-07-26", "studyMinutes": 0, "goodPostureRatio": None},
    ],
}


# ── ② 프롬프트 (v2: 전문 소견 + 표 포함) ──────────────────────
SYSTEM_PROMPT = """당신은 '각잡고' 서비스의 자세 건강 전문 코치입니다. 물리치료·인간공학 지식을 갖추고
학습자의 주간 데이터를 임상 소견서 형식으로 분석합니다. 전문적이되 학습자가 이해할 수 있는 언어를 사용합니다.

전문성 지침:
- 자세 관련 용어를 적절히 사용할 것: 정적 자세 부하, 경추 전방 이동(거북목 경향), 상부 승모근 긴장,
  근골격 피로 누적, 미세 휴식(micro-break) 등.
- 수치의 "의미"를 해석할 것 (예: 목 점수 78 → "경추 부위에 반복적인 전방 이동 패턴이 관찰됨").
- 변화 추세(전주 대비)를 반드시 임상적 관점으로 평가할 것.

반드시 지킬 것:
- 제공된 수치만 사용하고 새로운 수치를 만들지 말 것.
- 질병명 단정·의학적 진단 금지. "~경향", "~관찰됨", "~권고" 수준으로.
- 아래 형식의 마크다운으로만 출력할 것. 표는 마크다운 표 문법으로.

출력 형식:
## 1. 주간 종합 소견
(4~5문장: 전반 평가 → 전주 대비 변화의 임상적 의미 → 핵심 관찰 사항)

## 2. 핵심 지표 분석
| 지표 | 이번 주 | 전주 | 변화 | 평가 |
(제공된 수치로 채우고, '평가' 칸은 양호/주의/개선필요 중 하나 + 짧은 근거)

## 3. 부위별 소견
| 부위 | 점수 | 소견 |
(목/어깨/어깨 균형 각각. 소견은 1~2문장, 점수가 가장 낮은 부위는 상세히)

## 4. 개선 권고
- (3개: 구체적 스트레칭 이름·빈도·시간 포함. 서비스에 있는 동작 우선:
   목 옆 기울이기, 목 돌리기, 대각선 목 스트레칭, 어깨 으쓱, 크로스바디, 어깨 돌리기)

## 5. 다음 주 관찰 포인트
- (2개: 다음 리포트에서 확인해야 할 지표와 목표 수치)"""


def build_user_prompt(m: dict) -> str:
    hours = m["totalStudySeconds"] / 3600
    focus_hours = m["focusedSeconds"] / 3600
    ec, pec = m["eventCounts"], m["prevEventCounts"]
    bp, pbp = m["bodyPartScores"], m["prevBodyPartScores"]
    daily = "\n".join(
        f"  - {d['date']}: 공부 {d['studyMinutes']}분"
        + (f", 자세유지율 {d['goodPostureRatio']}%" if d["goodPostureRatio"] is not None else " (학습 없음)")
        for d in m["dailyStats"]
    )
    return f"""다음은 학습자의 주간({m['period']['from']} ~ {m['period']['to']}) 데이터입니다.

[학습량]
- 총 공부 시간: {hours:.1f}시간 / 집중 시간 {focus_hours:.1f}시간 / 집중 점수 {m['focusScore']}/100

[자세 점수 (이번 주 / 전주)]
- 종합: {m['totalScore']} / {m['prevTotalScore']}
- 자세 유지율: {m['goodPostureRatio']}% / {m['prevGoodPostureRatio']}%
- 목: {bp['neck']} / {pbp['neck']},  어깨: {bp['shoulder']} / {pbp['shoulder']},  어깨 균형: {bp['shoulderTilt']} / {pbp['shoulderTilt']}

[감지 이벤트 (이번 주 / 전주)]
- 나쁜 자세: {ec['badPosture']} / {pec['badPosture']}회
- 졸음: {ec['drowsy']} / {pec['drowsy']}회
- 자리비움: {ec['away']} / {pec['away']}회
- 경고 누적: {m['warningCount']}회

[스트레칭]
- 수행 {m['stretchingCompletedCount']}/{m['stretchingAttemptCount']}회 완료

[일별 기록]
{daily}

위 데이터로 소견서를 작성해주세요."""


# ── ③ 차트 생성 (matplotlib — LLM 아님) ───────────────────────
def generate_charts(m: dict, out_dir: Path, stamp: str) -> list[Path]:
    import matplotlib

    matplotlib.use("Agg")  # 창 없이 파일로만
    import matplotlib.pyplot as plt

    plt.rcParams["font.family"] = "Malgun Gothic"  # 한글 폰트
    plt.rcParams["axes.unicode_minus"] = False

    paths = []
    GREEN, ORANGE, RED, GRAY = "#2d8c3c", "#f59e0b", "#f04438", "#98a2b3"

    # 차트 1: 일별 공부시간(막대) + 자세유지율(선)
    days = [d["date"][5:].replace("-", "/") for d in m["dailyStats"]]
    minutes = [d["studyMinutes"] for d in m["dailyStats"]]
    ratios = [d["goodPostureRatio"] for d in m["dailyStats"]]
    fig, ax1 = plt.subplots(figsize=(8, 3.5))
    ax1.bar(days, minutes, color=GREEN, alpha=0.75, label="공부 시간(분)")
    ax1.set_ylabel("공부 시간(분)")
    ax2 = ax1.twinx()
    xs = [i for i, r in enumerate(ratios) if r is not None]
    ys = [r for r in ratios if r is not None]
    ax2.plot(xs, ys, color=ORANGE, marker="o", linewidth=2, label="자세 유지율(%)")
    ax2.set_ylim(0, 100)
    ax2.set_ylabel("자세 유지율(%)")
    ax1.set_title("일별 학습 시간 · 자세 유지율")
    fig.tight_layout()
    p = out_dir / f"chart_daily_{stamp}.png"
    fig.savefig(p, dpi=120)
    plt.close(fig)
    paths.append(p)

    # 차트 2: 부위별 점수 (이번 주 vs 전주)
    parts = ["목", "어깨", "어깨 균형"]
    cur = [m["bodyPartScores"][k] for k in ("neck", "shoulder", "shoulderTilt")]
    prev = [m["prevBodyPartScores"][k] for k in ("neck", "shoulder", "shoulderTilt")]
    x = range(len(parts))
    fig, ax = plt.subplots(figsize=(6, 3.2))
    ax.bar([i - 0.18 for i in x], prev, width=0.36, color=GRAY, label="전주")
    bars = ax.bar([i + 0.18 for i in x], cur, width=0.36, label="이번 주")
    for b, v in zip(bars, cur):
        b.set_color(GREEN if v >= 85 else ORANGE if v >= 70 else RED)
        ax.text(b.get_x() + b.get_width() / 2, v + 1, str(v), ha="center", fontsize=10)
    ax.set_xticks(list(x))
    ax.set_xticklabels(parts)
    ax.set_ylim(0, 105)
    ax.set_title("부위별 자세 점수")
    ax.legend()
    fig.tight_layout()
    p = out_dir / f"chart_bodyparts_{stamp}.png"
    fig.savefig(p, dpi=120)
    plt.close(fig)
    paths.append(p)

    # 차트 3: 감지 이벤트 (이번 주 vs 전주)
    labels = ["나쁜 자세", "졸음", "자리비움"]
    cur_e = [m["eventCounts"][k] for k in ("badPosture", "drowsy", "away")]
    prev_e = [m["prevEventCounts"][k] for k in ("badPosture", "drowsy", "away")]
    x = range(len(labels))
    fig, ax = plt.subplots(figsize=(6, 3.2))
    ax.bar([i - 0.18 for i in x], prev_e, width=0.36, color=GRAY, label="전주")
    ax.bar([i + 0.18 for i in x], cur_e, width=0.36, color=RED, alpha=0.8, label="이번 주")
    for i, v in enumerate(cur_e):
        ax.text(i + 0.18, v + 0.3, str(v), ha="center", fontsize=10)
    ax.set_xticks(list(x))
    ax.set_xticklabels(labels)
    ax.set_title("감지 이벤트 횟수")
    ax.legend()
    fig.tight_layout()
    p = out_dir / f"chart_events_{stamp}.png"
    fig.savefig(p, dpi=120)
    plt.close(fig)
    paths.append(p)

    return paths


# ── ④ LLM 호출 (GMS — OpenAI 호환 API) ────────────────────────
def call_gms(system_prompt: str, user_prompt: str) -> str:
    import requests

    api_key = os.environ.get("GMS_API_KEY")
    base_url = os.environ.get("GMS_BASE_URL", "https://gms.ssafy.io/gmsapi/api.openai.com/v1")
    model = os.environ.get("GMS_MODEL", "gpt-4o-mini")

    if not api_key or api_key == "여기에_키_붙여넣기":
        sys.exit("GMS_API_KEY가 설정되지 않았습니다. ai/.env 의 GMS_API_KEY 값을 확인하세요.")

    resp = requests.post(
        f"{base_url}/chat/completions",
        headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
        json={
            "model": model,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            "temperature": 0.4,
            "max_tokens": 1500,
        },
        timeout=60,
    )
    resp.raise_for_status()
    return resp.json()["choices"][0]["message"]["content"]


# ── ⑤-a PDF 생성 (fpdf2 — 실서비스 PDF 산출물의 프로토타입) ────
# --dry-run --pdf 테스트용 샘플 소견 (LLM 미호출 시 PDF 레이아웃 검증에 사용)
SAMPLE_OPINION = """## 1. 주간 종합 소견
이번 주 자세 유지율은 87%로 전주(82%) 대비 개선되어 정적 자세 부하 관리가 향상되는 추세입니다. (샘플 텍스트)

## 2. 핵심 지표 분석
| 지표 | 이번 주 | 전주 | 변화 | 평가 |
|---|---|---|---|---|
| 자세 유지율 | 87% | 82% | +5%p | 양호 |
| 나쁜 자세 | 24회 | 28회 | -4회 | 개선 중 |

## 3. 부위별 소견
| 부위 | 점수 | 소견 |
|---|---|---|
| 목 | 78 | 경추 전방 이동 경향 관찰 (샘플) |

## 4. 개선 권고
- 목 옆 기울이기 스트레칭을 매 휴식마다 좌우 10초씩 수행하세요. (샘플)
"""


def build_pdf(m: dict, opinion: str, chart_paths: list[Path], out_dir: Path, stamp: str) -> Path:
    from fpdf import FPDF

    pdf = FPDF(format="A4")
    pdf.set_auto_page_break(auto=True, margin=18)
    pdf.add_font("Malgun", "", r"C:\Windows\Fonts\malgun.ttf")
    pdf.add_font("Malgun", "B", r"C:\Windows\Fonts\malgunbd.ttf")
    pdf.add_page()
    content_w = pdf.w - pdf.l_margin - pdf.r_margin

    # 표지 헤더
    pdf.set_font("Malgun", "B", 20)
    pdf.cell(0, 12, "주간 자세·학습 리포트", new_x="LMARGIN", new_y="NEXT")
    pdf.set_font("Malgun", "", 11)
    pdf.set_text_color(100)
    pdf.cell(0, 8, f"기간: {m['period']['from']} ~ {m['period']['to']}", new_x="LMARGIN", new_y="NEXT")
    pdf.cell(0, 8, f"각잡고 AI 리포트 (prompt {PROMPT_VERSION})", new_x="LMARGIN", new_y="NEXT")
    pdf.set_text_color(0)
    pdf.ln(4)

    # 차트 삽입 (PDF 안에 바이트로 임베드됨 — PNG 원본은 이후 삭제 가능)
    pdf.set_font("Malgun", "B", 14)
    pdf.cell(0, 10, "주간 지표 그래프", new_x="LMARGIN", new_y="NEXT")
    for p in chart_paths:
        if pdf.get_y() > pdf.h - 90:
            pdf.add_page()
        pdf.image(str(p), w=content_w)
        pdf.ln(3)

    # 소견 본문 (마크다운 간이 렌더링: 제목/불릿/표)
    pdf.add_page()
    lines = opinion.splitlines()
    i = 0
    while i < len(lines):
        line = lines[i].strip()
        if line.startswith("|"):
            # 마크다운 표 블록 수집
            rows = []
            while i < len(lines) and lines[i].strip().startswith("|"):
                cells = [c.strip() for c in lines[i].strip().strip("|").split("|")]
                if not all(set(c) <= {"-", ":", " "} for c in cells):  # 구분선 제외
                    rows.append(cells)
                i += 1
            if rows:
                pdf.set_font("Malgun", "", 9.5)
                with pdf.table(first_row_as_headings=True, line_height=7) as table:
                    for r_i, row in enumerate(rows):
                        tr = table.row()
                        for cell in row:
                            tr.cell(cell)
                pdf.ln(3)
            continue
        if line.startswith("## "):
            pdf.ln(2)
            pdf.set_font("Malgun", "B", 14)
            pdf.multi_cell(content_w, 9, line[3:], new_x="LMARGIN", new_y="NEXT")
            pdf.ln(1)
        elif line.startswith("- "):
            pdf.set_font("Malgun", "", 10.5)
            pdf.multi_cell(content_w, 7, "  •  " + line[2:], new_x="LMARGIN", new_y="NEXT")
        elif line:
            pdf.set_font("Malgun", "", 10.5)
            pdf.multi_cell(content_w, 7, line, new_x="LMARGIN", new_y="NEXT")
        else:
            pdf.ln(2)
        i += 1

    p = out_dir / f"report_{PROMPT_VERSION}_{stamp}.pdf"
    pdf.output(str(p))
    return p


# ── ⑤ 종합 리포트 조립 ─────────────────────────────────────────
def assemble_report(m: dict, opinion: str, chart_paths: list[Path], out_dir: Path, stamp: str) -> Path:
    model = os.environ.get("GMS_MODEL", "gpt-4o-mini")
    charts_md = "\n\n".join(f"![{p.stem}]({p.name})" for p in chart_paths)
    content = f"""# 주간 자세·학습 리포트
**기간**: {m['period']['from']} ~ {m['period']['to']}
<!-- prompt_version: {PROMPT_VERSION}, model: {model} -->

## 주간 지표 그래프

{charts_md}

---

{opinion}
"""
    p = out_dir / f"report_{PROMPT_VERSION}_{stamp}.md"
    p.write_text(content, encoding="utf-8")
    return p


def main() -> None:
    parser = argparse.ArgumentParser(description="LLM 소견 생성 프로토타입 v2")
    parser.add_argument("--dry-run", action="store_true",
                        help="LLM 호출 없이 프롬프트 출력 + 차트만 생성")
    parser.add_argument("--pdf", action="store_true",
                        help="PDF 리포트도 생성 (--dry-run과 함께 쓰면 샘플 소견으로 레이아웃 테스트)")
    parser.add_argument("--source", choices=["mock", "db"], default="mock",
                        help="집계 데이터 출처: mock(기본) 또는 db(protractor 실데이터)")
    parser.add_argument("--member-id", type=int, default=1,
                        help="--source db 일 때 집계할 회원 ID")
    parser.add_argument("--week-start", type=str, default=None,
                        help="--source db 일 때 주 시작일(YYYY-MM-DD, 월요일). 생략 시 이번 주 월요일")
    args = parser.parse_args()

    out_dir = Path(__file__).resolve().parent / "outputs"
    out_dir.mkdir(exist_ok=True)
    stamp = datetime.now().strftime("%m%d_%H%M%S")

    # ── 집계 데이터 선택: 목 vs DB 실데이터 ──
    if args.source == "db":
        from datetime import date, timedelta

        from db_metrics import fetch_metrics

        if args.week_start:
            week_start = date.fromisoformat(args.week_start)
        else:
            today = date.today()
            week_start = today - timedelta(days=today.weekday())  # 이번 주 월요일
        print(f"=== DB 집계: member_id={args.member_id}, week={week_start} ~ ===")
        metrics = fetch_metrics(args.member_id, week_start)
        if metrics["totalStudySeconds"] == 0:
            print("⚠️  해당 기간에 학습 기록이 없습니다. member_id/week-start를 확인하세요.")
    else:
        metrics = MOCK_METRICS

    user_prompt = build_user_prompt(metrics)

    print(f"=== prompt_version: {PROMPT_VERSION} ===\n")
    print("=== [SYSTEM PROMPT] ===")
    print(SYSTEM_PROMPT)
    print("\n=== [USER PROMPT] ===")
    print(user_prompt)

    print("\n=== 차트 생성 중 (matplotlib) ===")
    chart_paths = generate_charts(metrics, out_dir, stamp)
    for p in chart_paths:
        print(f"  생성: {p}")

    if args.dry_run:
        if args.pdf:
            pdf_path = build_pdf(metrics, SAMPLE_OPINION, chart_paths, out_dir, stamp)
            print(f"\n샘플 PDF 생성 (레이아웃 테스트): {pdf_path}")
        print("\n(--dry-run: LLM 호출 생략. 산출물은 outputs/ 에서 확인 가능)")
        return

    print("\n=== GMS 호출 중... ===")
    opinion = call_gms(SYSTEM_PROMPT, user_prompt)
    print("\n=== [생성된 소견] ===")
    print(opinion)

    report_path = assemble_report(metrics, opinion, chart_paths, out_dir, stamp)
    print(f"\n종합 리포트 저장: {report_path}")
    if args.pdf:
        pdf_path = build_pdf(metrics, opinion, chart_paths, out_dir, stamp)
        print(f"PDF 리포트 저장: {pdf_path}")
    print("(md는 VS Code Ctrl+Shift+V 미리보기, PDF는 더블클릭으로 확인)")


if __name__ == "__main__":
    main()
