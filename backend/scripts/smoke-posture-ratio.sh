#!/usr/bin/env bash
#
# 자세 유지율 계산 회귀 스모크.
#
# 무엇을 검증하나
#   1) 겹친 구간을 두 번 세지 않는다        — 거북목 안에 턱 괴기가 포함된 픽스처
#   2) 열린 이벤트를 종료 시 닫는다          — ended_at 이 빈 행
#   3) 이상값을 조용히 넘기지 않는다          — 나쁜 자세 > 총 시간이면 서버 로그에 warn
#
# 왜 이렇게 하나
#   카메라로 30초씩 자세를 잡아 가며 확인하면 오래 걸리고 매번 값이 달라진다. 이벤트를 DB에
#   직접 넣고 종료 API만 부르면 몇 초 만에 끝나고 결과가 항상 같다. 계산 로직을 고칠 때
#   이 스크립트만 돌리면 된다.
#
# 쓰는 법
#   1) docker compose up -d mysql redis
#   2) 8081로 백엔드 실행:  SERVER_PORT=8081 DB_PASSWORD=ssafy ./gradlew bootRun
#      (8080은 평소 개발용이라 건드리지 않는다)
#   3) bash backend/scripts/smoke-posture-ratio.sh
#
# 픽스처는 끝나면 지운다. 실패해도 지우도록 trap 을 걸어 뒀다.
set -uo pipefail

BASE_URL="${BASE_URL:-http://localhost:8081/api/v1}"
MYSQL_CONTAINER="${MYSQL_CONTAINER:-gakdogi-mysql}"
MYSQL_PASSWORD="${MYSQL_PASSWORD:-ssafy}"
DB_NAME="${DB_NAME:-protractor}"

# 스모크 계정. 로컬 DB의 회원 id 와 맞아야 한다(HANDOFF §5 로컬 DB 참고).
EMAIL_A="${EMAIL_A:-mypage-smoke1@test.com}"
MEMBER_A="${MEMBER_A:-23}"
EMAIL_B="${EMAIL_B:-mypage-smoke2@test.com}"
MEMBER_B="${MEMBER_B:-24}"
PASSWORD="${PASSWORD:-Test1234!}"

# 실제 기록과 부딪히지 않도록 큰 번호를 쓴다.
RECORD_MERGE=99001   # 겹침 검증용
RECORD_OPEN=99002    # 열린 이벤트 + 경고 로그 검증용
ROOM_ID="${ROOM_ID:-1}"

pass=0
fail=0

mysql_exec() {
	docker exec -i "$MYSQL_CONTAINER" mysql -uroot -p"$MYSQL_PASSWORD" "$DB_NAME" \
		--default-character-set=utf8mb4 -N -B -e "$1" 2>/dev/null
}

cleanup() {
	mysql_exec "DELETE FROM events WHERE study_record_id IN ($RECORD_MERGE, $RECORD_OPEN);
	            DELETE FROM study_records WHERE study_record_id IN ($RECORD_MERGE, $RECORD_OPEN);" >/dev/null
}
trap cleanup EXIT

check() { # check <설명> <기대값> <실제값>
	if [ "$2" = "$3" ]; then
		echo "  ✅ $1 — $3"
		pass=$((pass + 1))
	else
		echo "  ❌ $1 — 기대 $2 / 실제 $3"
		fail=$((fail + 1))
	fi
}

login() { # login <이메일> → 액세스 토큰
	curl -s -X POST "$BASE_URL/auth/login" -H 'Content-Type: application/json' \
		-d "{\"email\":\"$1\",\"password\":\"$PASSWORD\"}" |
		python -c 'import sys,json; print(json.load(sys.stdin).get("accessToken",""))' 2>/dev/null
}

end_session() { # end_session <세션id> <토큰> <집중초> → 종료 응답 JSON
	curl -s -X PATCH "$BASE_URL/study-records/$1/end" \
		-H 'Content-Type: application/json' -H "Authorization: Bearer $2" \
		-d "{\"focusedSeconds\":$3,\"breakSeconds\":0,\"awaySeconds\":0,\"endReason\":\"USER_EXIT\"}"
}

field() { # field <JSON> <키>
	echo "$1" | python -c "import sys,json; print(json.load(sys.stdin).get('$2'))" 2>/dev/null
}

echo "== 자세 유지율 스모크 =="
if ! curl -sf -o /dev/null "${BASE_URL%/api/v1}/swagger-ui/index.html"; then
	echo "❌ 서버에 연결할 수 없다: $BASE_URL"
	echo "   SERVER_PORT=8081 DB_PASSWORD=ssafy ./gradlew bootRun 으로 먼저 띄울 것"
	exit 1
fi

TOKEN_A=$(login "$EMAIL_A")
TOKEN_B=$(login "$EMAIL_B")
if [ -z "$TOKEN_A" ] || [ -z "$TOKEN_B" ]; then
	echo "❌ 로그인 실패 — 스모크 계정이 로컬 DB에 있는지 확인할 것($EMAIL_A / $EMAIL_B)"
	exit 1
fi

cleanup

# ── 픽스처 ──────────────────────────────────────────────────────
# 시각은 모두 오전으로 둔다. 종료 시 left_at 이 '지금'이 되는데, 시작이 그보다 뒤면
# 체크 제약(chk_study_records_time_order)에 걸려 500 이 난다.
#
# 99001: 거북목 09:00~09:10(600초) 안에 턱 괴기 09:02~09:08(360초)이 통째로 들어 있고,
#        떨어진 거북목 09:20~09:25(300초)이 하나 더 있다.
#        단순 합산이면 1260초, 겹침을 제거하면 900초다.
# 99002: 닫히지 않은 이벤트 하나만 있는 세션. 종료 시 서버가 닫아야 하고,
#        그 길이가 공부한 시간을 넘으므로 경고 로그가 남아야 한다.
mysql_exec "
INSERT INTO study_records (study_record_id, study_room_id, member_id, study_date, joined_at,
                           total_study_seconds, focused_seconds, break_seconds, away_seconds)
VALUES ($RECORD_MERGE, $ROOM_ID, $MEMBER_A, CURDATE(), CONCAT(CURDATE(), ' 09:00:00'), 0, 0, 0, 0),
       ($RECORD_OPEN,  $ROOM_ID, $MEMBER_B, CURDATE(), CONCAT(CURDATE(), ' 09:00:00'), 0, 0, 0, 0);

INSERT INTO events (study_record_id, event_type, detail, body_part, severity, started_at, ended_at, duration_seconds)
VALUES
  ($RECORD_MERGE, 'POSTURE', 'FORWARD_HEAD',  'NECK',     5, CONCAT(CURDATE(), ' 09:00:00'), CONCAT(CURDATE(), ' 09:10:00'), 600),
  ($RECORD_MERGE, 'POSTURE', 'CHIN_REST',     'NECK',     4, CONCAT(CURDATE(), ' 09:02:00'), CONCAT(CURDATE(), ' 09:08:00'), 360),
  ($RECORD_MERGE, 'POSTURE', 'FORWARD_HEAD',  'NECK',     5, CONCAT(CURDATE(), ' 09:20:00'), CONCAT(CURDATE(), ' 09:25:00'), 300),
  ($RECORD_OPEN,  'POSTURE', 'SHOULDER_TILT', 'SHOULDER', 4, CONCAT(CURDATE(), ' 09:05:00'), NULL, NULL);
" >/dev/null

# ── 1. 겹친 구간 합산 ────────────────────────────────────────────
echo
echo "[1] 겹친 구간을 두 번 세지 않는가 (단순 합산 1260초 → 겹침 제거 900초)"
RES=$(end_session "$RECORD_MERGE" "$TOKEN_A" 1994)
check "나쁜 자세 시간(초)" "900" "$(field "$RES" badPostureSeconds)"
# (1994 - 900) / 1994 = 54.86%. 겹침을 제거하지 않으면 36.81% 가 된다.
check "자세 유지율(%)" "54.86" "$(field "$RES" goodPostureRatio)"

# ── 2. 열린 이벤트 닫기 ──────────────────────────────────────────
echo
echo "[2] 닫히지 않은 이벤트를 종료 시 닫는가"
RES=$(end_session "$RECORD_OPEN" "$TOKEN_B" 1994)
CLOSED=$(mysql_exec "SELECT COUNT(*) FROM events WHERE study_record_id=$RECORD_OPEN AND ended_at IS NULL;")
check "남은 열린 이벤트" "0" "$CLOSED"
check "종료 사유 기록" "SESSION_END" \
	"$(mysql_exec "SELECT resolved_by FROM events WHERE study_record_id=$RECORD_OPEN LIMIT 1;")"

# ── 3. 이상값 방어 ───────────────────────────────────────────────
echo
echo "[3] 나쁜 자세가 총 시간을 넘으면 잘라 저장하되 흔적을 남기는가"
# 열린 이벤트를 09:05 부터 '지금'까지로 닫으므로 공부한 시간을 훌쩍 넘는다.
check "총 시간으로 잘림" "$(field "$RES" totalStudySeconds)" "$(field "$RES" badPostureSeconds)"
check "유지율 0%" "0.0" "$(field "$RES" goodPostureRatio)"
echo "  ℹ 서버 콘솔에 '나쁜 자세 시간이 총 학습 시간을 넘었습니다' warn 로그가 있는지 눈으로 확인할 것"

# ── 결과 ────────────────────────────────────────────────────────
echo
echo "== 결과: 통과 $pass / 실패 $fail =="
[ "$fail" -eq 0 ] || exit 1
