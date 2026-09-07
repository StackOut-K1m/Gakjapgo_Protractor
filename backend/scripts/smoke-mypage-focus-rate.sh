#!/usr/bin/env bash
#
# 마이페이지 학습 집중률 계산 회귀 스모크.
#
# 무엇을 검증하나 (식 = 순공부 ÷ (총 학습 − 휴식), MyPageService.attendanceRate)
#   1) 휴식이 값에 끼지 않는다      — 순공 2970·휴식 600·자리비움 1030 픽스처가 74.25%
#                                     (옛 식 "(총−자리비움)÷총" 이면 79.80%가 나온다)
#   2) 전부 휴식인 방은 null        — 분모 0이면 계산하지 않고 FE가 "-"로 표시
#   3) 방별 목록도 같은 식을 쓴다   — summary 와 study-rooms 가 같은 메서드를 타는지 확인
#
# 쓰는 법 (smoke-posture-ratio.sh 와 동일)
#   1) docker compose up -d mysql redis
#   2) 8081로 백엔드 실행:  SERVER_PORT=8081 DB_PASSWORD=ssafy ./gradlew bootRun
#   3) bash backend/scripts/smoke-mypage-focus-rate.sh
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
PASSWORD="${PASSWORD:-Test1234!}"

# 실제 기록과 부딪히지 않도록 큰 번호를 쓴다.
ROOM_MIX=990001     # 순공+휴식+자리비움이 섞인 방
ROOM_BREAK=990002   # 전부 휴식인 방
RECORD_MIX=990101
RECORD_BREAK=990201

pass=0
fail=0

mysql_exec() {
	docker exec -i "$MYSQL_CONTAINER" mysql -uroot -p"$MYSQL_PASSWORD" "$DB_NAME" \
		--default-character-set=utf8mb4 -N -B -e "$1" 2>/dev/null
}

cleanup() {
	mysql_exec "DELETE FROM study_records WHERE study_record_id IN ($RECORD_MIX, $RECORD_BREAK);
	            DELETE FROM study_rooms WHERE study_room_id IN ($ROOM_MIX, $ROOM_BREAK);" >/dev/null
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

field() { # field <JSON> <키>
	echo "$1" | python -c "import sys,json; print(json.load(sys.stdin).get('$2'))" 2>/dev/null
}

room_field() { # room_field <목록JSON> <roomId> <키>
	echo "$1" | python -c "
import sys, json
rooms = json.load(sys.stdin)['studyRooms']
match = [r for r in rooms if r['roomId'] == $2]
print(match[0]['$3'] if match else 'NOT_FOUND')" 2>/dev/null
}

echo "== 학습 집중률 스모크 =="
if ! curl -sf -o /dev/null "${BASE_URL%/api/v1}/swagger-ui/index.html"; then
	echo "❌ 서버에 연결할 수 없다: $BASE_URL"
	echo "   SERVER_PORT=8081 DB_PASSWORD=ssafy ./gradlew bootRun 으로 먼저 띄울 것"
	exit 1
fi

# 요약은 회원의 전체 기록을 합산하므로, 잔여 기록이 있으면 기대값이 어긋난다.
LEFTOVER=$(mysql_exec "SELECT COUNT(*) FROM study_records WHERE member_id=$MEMBER_A;")
if [ "$LEFTOVER" != "0" ]; then
	echo "❌ 회원 $MEMBER_A 에게 기존 학습 기록이 $LEFTOVER 건 있다 — 스모크 기대값이 안 맞으니 정리 후 다시 돌릴 것"
	exit 1
fi

TOKEN_A=$(login "$EMAIL_A")
if [ -z "$TOKEN_A" ]; then
	echo "❌ 로그인 실패 — 스모크 계정이 로컬 DB에 있는지 확인할 것($EMAIL_A)"
	exit 1
fi

cleanup

# ── 픽스처 ──────────────────────────────────────────────────────
# 990001: 순공 2970 + 휴식 600 + 자리비움 1030 = 총 4600.
#         새 식 2970/(2970+1030)=74.25%, 옛 식 (4600-1030)/4600=77.61%.
# 990002: 전부 휴식(500초). 분모가 0이라 집중률 null 이어야 한다.
mysql_exec "
INSERT INTO study_rooms (study_room_id, host_member_id, title, status)
VALUES ($ROOM_MIX,   $MEMBER_A, '집중률 스모크 A', 'ENDED'),
       ($ROOM_BREAK, $MEMBER_A, '집중률 스모크 B', 'ENDED');

INSERT INTO study_records (study_record_id, study_room_id, member_id, study_date, joined_at, left_at,
                           total_study_seconds, focused_seconds, break_seconds, away_seconds)
VALUES ($RECORD_MIX,   $ROOM_MIX,   $MEMBER_A, CURDATE(), CONCAT(CURDATE(), ' 09:00:00'), CONCAT(CURDATE(), ' 10:20:00'), 4600, 2970, 600, 1030),
       ($RECORD_BREAK, $ROOM_BREAK, $MEMBER_A, CURDATE(), CONCAT(CURDATE(), ' 11:00:00'), CONCAT(CURDATE(), ' 11:10:00'),  500,    0, 500,    0);
" >/dev/null

# ── 1. 요약 카드 ─────────────────────────────────────────────────
echo
echo "[1] 요약의 집중률이 휴식을 뺀 식으로 나오는가 (옛 식이면 79.80)"
SUMMARY=$(curl -s "$BASE_URL/mypage/summary" -H "Authorization: Bearer $TOKEN_A")
# 전체 합산: 순공 2970 / (2970 + 자리비움 1030) = 74.25
check "학습 집중률(%)" "74.25" "$(field "$SUMMARY" attendanceRate)"
check "총 학습 시간(초)" "5100" "$(field "$SUMMARY" totalStudyTime)"

# ── 2. 방별 목록 ─────────────────────────────────────────────────
echo
echo "[2] 방별 목록도 같은 식을 쓰는가"
ROOMS=$(curl -s "$BASE_URL/mypage/study-rooms?page=0&size=20" -H "Authorization: Bearer $TOKEN_A")
check "섞인 방 집중률(%)" "74.25" "$(room_field "$ROOMS" "$ROOM_MIX" attendanceRate)"
check "섞인 방 누적 시간(초)" "4600" "$(room_field "$ROOMS" "$ROOM_MIX" totalStudySeconds)"

# ── 3. 전부 휴식 ─────────────────────────────────────────────────
echo
echo "[3] 전부 휴식인 방은 null 인가 (옛 식이면 100%가 나오던 경우)"
check "휴식만 한 방 집중률" "None" "$(room_field "$ROOMS" "$ROOM_BREAK" attendanceRate)"

# ── 결과 ────────────────────────────────────────────────────────
echo
echo "== 결과: 통과 $pass / 실패 $fail =="
[ "$fail" -eq 0 ] || exit 1
