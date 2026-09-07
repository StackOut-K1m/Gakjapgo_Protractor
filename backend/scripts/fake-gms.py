# 리포트 스모크용 가짜 GMS 서버 (기본 8082).
#
# OpenAI 호환 chat/completions 흉내. 실 GMS 키 없이 리포트 생성 파이프라인 전체
# (집계 → 소견 → 차트 → PDF)를 돌려 보기 위한 것.
#
# 소견은 고정 문구가 아니라 **요청 프롬프트의 수치를 읽어 채우는 템플릿**이다.
# 고정 문구를 쓰면 시나리오마다 데이터와 어긋난 문장("유지율 80%대"인데 실제 95% 등)이 실려
# 샘플 PDF가 이상해 보인다. 단, 문장 품질은 어디까지나 템플릿 수준 — 실제 LLM(gpt-4.1)의
# 소견 품질을 평가하려면 GMS_BASE_URL 없이 실키로 부팅해 생성해 볼 것.
#
# 사용법:  python backend/scripts/fake-gms.py        (중지는 Ctrl+C)
#
# 구현 주의 2가지 (지키지 않으면 생성이 간헐적으로 FAILED 된다 — 2026-08-05 스모크에서 겪음):
#   1) 자바 RestClient는 요청 본문을 Transfer-Encoding: chunked 로 보낸다. 본문을 끝까지
#      읽지 않으면 찌꺼기가 keep-alive 연결의 다음 요청을 깨뜨린다 → chunked 파싱 필수.
#   2) HTTP/1.1 + keep-alive 를 유지한다. 응답마다 연결을 끊으면 자바 커넥션 풀이
#      죽은 소켓을 재사용하다 실패한다.
import json
import re
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

PART_NAMES = {"neck": "목", "chin": "턱 괴기", "tilt": "어깨 균형"}


def grab(pattern, text, group=1):
    m = re.search(pattern, text)
    return m.group(group) if m else None


def to_int(value):
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def build_opinion(prompt: str) -> str:
    """프롬프트 v6의 데이터 블록을 읽어 형식에 맞는 소견을 조립한다. 파싱이 어긋나도 문장이 깨지지 않게 방어적으로 쓴다."""
    focus_time = grab(r"- 순공부 시간: (.+)", prompt) or "?"
    ratio = to_int(grab(r"바른 자세 유지율: (\d+)%", prompt))
    prev_ratio = to_int(grab(r"바른 자세 유지율: \d+% / (\d+)%", prompt))
    first_week = "기록 없음" in (grab(r"바른 자세 유지율: \d+% / (\S+(?: \S+)?)", prompt) or "")
    goal_rate = to_int(grab(r"달성률 (\d+)%", prompt))
    goal_unset = "설정 안 함" in prompt

    parts = {
        "neck": to_int(grab(r"목\(거북목\): (\d+)", prompt)),
        "chin": to_int(grab(r"턱 괴기: (\d+)", prompt)),
        "tilt": to_int(grab(r"어깨 균형: (\d+)", prompt)),
    }
    known = {k: v for k, v in parts.items() if v is not None}
    worst = min(known, key=known.get) if known else None
    best = max(known, key=known.get) if known else None

    bad_count = to_int(grab(r"- 합계: (\d+)", prompt)) or 0
    drowsy = to_int(grab(r"- 졸음: (\d+)", prompt)) or 0
    phone = to_int(grab(r"- 휴대폰 사용: (\d+)", prompt)) or 0

    daily_minutes = [int(m) for m in re.findall(r"- \d{4}-\d{2}-\d{2}: 총 학습 (\d+)분", prompt)]
    study_days = len([m for m in daily_minutes if m > 0])
    daily_ratios = [int(m) for m in re.findall(r"자세유지율 (\d+)%", prompt)]

    stretches = re.findall(r"- ([^\n(]+?) \((?:목|어깨), (\d+)초 유지\)", prompt)

    # ── 그래프 판독 ──
    g1 = f"이번 주 학습은 {study_days}일에 걸쳐 있습니다." if study_days else "이번 주는 학습 기록이 적습니다."
    if daily_ratios:
        lo, hi = min(daily_ratios), max(daily_ratios)
        g1 += f" 유지율은 {lo}%에서 {hi}% 사이로 움직였습니다." if lo != hi else f" 유지율은 {lo}%로 고르게 유지됐습니다."

    if first_week:
        g2 = "이전 주 기록이 없어 아직 흐름 비교는 어렵습니다. 다음 주부터 주별 변화가 그래프에 쌓입니다."
    else:
        g2 = "직전 주와 이번 주 막대를 비교해 보세요. 순공부 시간의 흐름이 유지율 변화와 함께 보입니다."

    if worst and known[worst] < 100:
        g3 = f"{PART_NAMES[worst]} 점수가 {known[worst]}점으로 가장 낮고, {PART_NAMES[best]}은 {known[best]}점으로 안정적입니다."
    else:
        g3 = "세 부위 모두 만점입니다. 확정된 나쁜 자세 없이 한 주를 보냈습니다."
    if first_week:
        g3 += " 회색(전주) 막대는 이전 기록이 없어 표시되지 않았습니다."

    total_breaks = bad_count + drowsy + phone
    if total_breaks == 0:
        g4 = "10초 이상 이어진 흐트러짐이 한 번도 확정되지 않은 주입니다."
    else:
        g4 = f"확정된 순간은 총 {total_breaks}회입니다 — 나쁜 자세 {bad_count}회, 졸음 {drowsy}회, 휴대폰 {phone}회."

    # ── 요약 ──
    if goal_unset:
        goal_line = "학습 목표는 아직 설정 전이라 달성률 없이 시간만 집계했습니다."
    elif goal_rate is not None and goal_rate >= 100:
        goal_line = f"주간 목표를 {goal_rate}%로 초과 달성했습니다."
    else:
        goal_line = f"주간 목표 달성률은 {goal_rate}%입니다."
    ratio_line = f"자세 유지율은 {ratio}%" if ratio is not None else "자세 유지율은 집계되지 않았"
    if prev_ratio is not None and ratio is not None:
        diff = ratio - prev_ratio
        ratio_line += f"로, 전주보다 {abs(diff)}%p {'올랐' if diff >= 0 else '내렸'}습니다."
    elif first_week:
        ratio_line += "이며, 첫 기록 주라 비교 기준은 다음 주부터 생깁니다."
    else:
        ratio_line += "입니다."
    summary = f"이번 주 순공부 시간은 {focus_time}입니다. {goal_line} {ratio_line}"
    if worst and known[worst] < 100:
        summary += f" 세 부위 중에서는 {PART_NAMES[worst]}이 관리 포인트입니다."

    # ── 잘한 점 / 아쉬운 점 ──
    strengths = []
    if best and known[best] >= 90:
        strengths.append(f"- **{PART_NAMES[best]}**: {known[best]}점으로 세 부위 중 가장 안정적입니다.")
    if goal_rate is not None and goal_rate >= 100:
        strengths.append(f"- **목표 달성**: 주간 목표를 {goal_rate}%로 채웠습니다.")
    if total_breaks == 0:
        strengths.append("- **집중 유지**: 10초 이상 이어진 흐트러짐 없이 공부를 이어갔습니다.")
    if not strengths:
        strengths.append(f"- **기록 유지**: {study_days}일의 학습 기록이 다음 분석의 기반이 됩니다.")

    concerns = []
    if worst and known[worst] < 90:
        concerns.append(f"- **{PART_NAMES[worst]}**: {known[worst]}점으로 가장 낮습니다. 모니터 높이와 의자 거리를 먼저 점검해 보세요.")
    if drowsy > 0:
        concerns.append(f"- **졸음**: {drowsy}회 감지됐습니다. 몰린 시간대가 있다면 그 앞에 짧은 휴식을 넣어 보세요.")
    if goal_rate is not None and goal_rate < 100:
        concerns.append(f"- **목표 페이스**: 달성률 {goal_rate}%로 목표에는 못 미쳤습니다.")
    if goal_unset:
        concerns.append("- **목표 없음**: 하루 목표가 없으면 달성률도 계산되지 않습니다. 작게라도 정해 보세요.")
    if not concerns:
        concerns.append("- 크게 아쉬운 항목이 없는 주입니다. 이 흐름을 유지하는 것이 다음 주 과제입니다.")

    # ── 실천 3가지 ──
    actions = []
    if stretches:
        name, hold = stretches[0]
        actions.append(f"- **{name.strip()} ({hold}초 유지)**: 50분 공부마다 한 번씩 해보세요.")
    if len(stretches) > 1:
        name, hold = stretches[1]
        actions.append(f"- **{name.strip()} ({hold}초 유지)**: 쉬는 시간마다 2~3회 반복하세요.")
    if goal_unset:
        actions.append("- **목표 정하기**: 하루 목표를 설정하면 다음 리포트부터 달성률이 함께 표시됩니다.")
    elif goal_rate is not None and goal_rate < 100:
        actions.append("- **목표 쪼개기**: 주간 목표가 부담되면 우선 하루 단위 최소치부터 채워 보세요.")
    else:
        actions.append("- **페이스 유지**: 지금의 학습 리듬을 다음 주에도 그대로 이어 가세요.")

    return "\n".join([
        "## 0. 그래프 판독",
        "### 그래프 1: 일별 학습 시간 · 자세 유지율", g1,
        "### 그래프 2: 최근 4주 흐름", g2,
        "### 그래프 3: 부위별 자세 점수", g3,
        "### 그래프 4: 집중을 깬 순간들", g4,
        "",
        "## 1. 이번 주 요약", summary,
        "",
        "## 2. 잘한 점", *strengths[:3],
        "",
        "## 3. 아쉬운 점", *concerns[:3],
        "",
        "## 4. 다음 주 실천 3가지", *actions[:3],
    ])


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def read_body(self) -> bytes:
        """Content-Length·chunked 둘 다 지원해 본문을 끝까지 읽어 돌려준다."""
        if "chunked" in (self.headers.get("Transfer-Encoding") or "").lower():
            chunks = []
            while True:
                size_line = self.rfile.readline().strip()
                size = int(size_line.split(b";")[0], 16)
                if size == 0:
                    self.rfile.readline()  # 마지막 빈 줄
                    return b"".join(chunks)
                chunks.append(self.rfile.read(size))
                self.rfile.readline()  # 청크 뒤 CRLF
        length = int(self.headers.get("Content-Length", 0))
        return self.rfile.read(length) if length > 0 else b""

    def do_POST(self):
        raw = self.read_body()
        try:
            messages = json.loads(raw.decode("utf-8"))["messages"]
            user_prompt = next(m["content"] for m in reversed(messages) if m.get("role") == "user")
            opinion = build_opinion(user_prompt)
        except Exception as e:  # 파싱이 깨져도 파이프라인은 살아 있어야 한다
            print("[fake-gms] 프롬프트 파싱 실패, 기본 소견으로 대체:", e, flush=True)
            opinion = ("## 1. 이번 주 요약\n프롬프트 파싱에 실패해 기본 소견을 반환했습니다. "
                       "fake-gms.py의 정규식을 프롬프트 형식과 맞춰 주세요.")

        body = json.dumps({
            "choices": [{
                "message": {"role": "assistant", "content": opinion},
                "finish_reason": "stop",
            }]
        }).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, fmt, *args):
        print("[fake-gms]", fmt % args, flush=True)


if __name__ == "__main__":
    print("[fake-gms] http://127.0.0.1:8082 에서 대기 중 (Ctrl+C로 종료)", flush=True)
    ThreadingHTTPServer(("127.0.0.1", 8082), Handler).serve_forever()
