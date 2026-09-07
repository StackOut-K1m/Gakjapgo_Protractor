#!/usr/bin/env bash
#
# 주간 리포트 회귀 스모크 — 시나리오 7종.
#
# 시나리오 (Given → Then):
#   S1 세션 종료 점수      — 시간 비율 부위 점수, 휴식 제외 집중률, 자세만의 종합
#   S2 휴식 극단           — 휴식이 순공의 2배여도 집중률이 깎이지 않는다
#   S3 첫 기록 주          — 전주 없음 = null(0 아님), 목표 미설정 = "미설정"
#   S4 목표 초과 달성      — 달성률 100% 초과 + 한 줄 요약이 목표 달성 문구
#   S5 감지 0회 + 유지율<100 — 30초 미만 흐트러짐만 있던 주(모순 아님, 각주로 설명되는 조합)
#   S6 정상 주(전주 있음)  — 시간 가중 평균·전주 비교·4주 추세·목표 달성률 전부
#   S7 학습 0초 기간       — 리포트 생성 요청이 400으로 거절된다
#
# 쓰는 법:
#   1) docker compose up -d mysql redis
#   2) python backend/scripts/fake-gms.py                # 가짜 GMS (8082)
#   3) SERVER_PORT=8081 DB_PASSWORD=ssafy GMS_BASE_URL=http://localhost:8082/v1 \
#      GMS_API_KEY=smoke ./gradlew bootRun               # backend 폴더에서
#   4) bash backend/scripts/smoke-report.sh
#      PDF_DIR=경로 를 주면 S3·S5·S6의 PDF와 summary JSON을 그 폴더에 남긴다(기준 산출물 보관용).
#
# 픽스처는 시나리오마다 넣고 지운다(시나리오 간 간섭 방지 — 특히 4주 추세). 실패해도 trap이 원복한다.
set -uo pipefail

BASE_URL="${BASE_URL:-http://localhost:8081/api/v1}"
MYSQL_CONTAINER="${MYSQL_CONTAINER:-gakdogi-mysql}"
MYSQL_PASSWORD="${MYSQL_PASSWORD:-ssafy}"
DB_NAME="${DB_NAME:-protractor}"
EMAIL="${EMAIL:-mypage-smoke1@test.com}"
MEMBER="${MEMBER:-23}"
PASSWORD="${PASSWORD:-Test1234!}"
PDF_DIR="${PDF_DIR:-}"

# ── 날짜는 전부 "오늘 기준 상대 날짜"로 잡는다 ──────────────────
# 고정 날짜를 쓰면 시간이 지나 리포트 열람기한(기간 종료 + 7일)이 지나 버려서
# PDF 다운로드가 410으로 거절된다(실제로 겪음 — 과거 주차 PDF가 에러 JSON으로 저장됐다).
THIS_MON=$(date -d "-$(( $(date +%u) - 1 )) days" +%F)   # 이번 주 월요일
THIS_SUN=$(date -d "$THIS_MON +6 days" +%F)
W_MON=$(date -d "$THIS_MON -7 days" +%F)                 # 지난주 월~일 (S5·S6 대상 주)
W_TUE=$(date -d "$W_MON +1 day" +%F)
W_WED=$(date -d "$W_MON +2 days" +%F)
W_THU=$(date -d "$W_MON +3 days" +%F)
W_SUN=$(date -d "$W_MON +6 days" +%F)
PREV_WED=$(date -d "$W_MON -5 days" +%F)                 # 전주(2주 전) 수요일 (S6의 비교 대상)
G_MON=$(date -d "$W_MON -21 days" +%F)                   # 3주 전 월요일 (S4 — PDF 없음이라 기한 무관)
G_D1=$(date -d "$G_MON +1 day" +%F)
G_D2=$(date -d "$G_MON +2 days" +%F)
G_D3=$(date -d "$G_MON +3 days" +%F)

# 실데이터와 부딪히지 않는 큰 번호대. 방 하나를 전 시나리오가 같이 쓴다.
ROOM=990101
R_END1=990199; R_END2=990198          # S1·S2 (오늘·어제, 종료 API 대상)
R_FIRST=990121                        # S3 (7/13 주)
R_GOAL1=990131; R_GOAL2=990132; R_GOAL3=990133   # S4 (7/6 주)
R_QUIET=990141                        # S5 (6/29 주)
R_W1=990111; R_W2=990112; R_W3=990113; R_PREV=990114   # S6 (7/27 주 + 전주)

pass=0; fail=0

mysql_exec() {
	docker exec -i "$MYSQL_CONTAINER" mysql -uroot -p"$MYSQL_PASSWORD" "$DB_NAME" \
		--default-character-set=utf8mb4 -N -B -e "$1" 2>/dev/null
}

cleanup() {
	mysql_exec "DELETE FROM events WHERE study_record_id BETWEEN 990100 AND 990199;
	            DELETE FROM reports WHERE member_id=$MEMBER;
	            DELETE FROM study_records WHERE study_record_id BETWEEN 990100 AND 990199;
	            DELETE FROM study_rooms WHERE study_room_id=$ROOM;
	            DELETE FROM member_preferences WHERE member_id=$MEMBER;" >/dev/null
	# 서버가 저장한 스모크용 PDF 파일도 지운다 (레포 루트/백엔드 어디서 실행해도 잡히게 두 경로 다 시도)
	rm -rf "backend/data/reports/member-$MEMBER" "data/reports/member-$MEMBER" 2>/dev/null
}
trap cleanup EXIT

check() { # check <설명> <기대값> <실제값>
	if [ "$2" = "$3" ]; then echo "  ✅ $1 — $3"; pass=$((pass+1));
	else echo "  ❌ $1 — 기대 $2 / 실제 $3"; fail=$((fail+1)); fi
}
field() { echo "$1" | python -c "import sys,json; d=json.load(sys.stdin); print(d$2)" 2>/dev/null; }
contains() { # contains <설명> <부분 문자열> <전체 문자열>
	case "$3" in *"$2"*) echo "  ✅ $1"; pass=$((pass+1));;
	*) echo "  ❌ $1 — '$2' 없음: $3"; fail=$((fail+1));; esac
}

summary() { curl -s "$BASE_URL/reports/me/summary?weekStart=$1" -H "Authorization: Bearer $TOKEN"; }

# 리포트 생성 → COMPLETED 확인. PDF_DIR 이 있으면 PDF와 summary JSON 을 남긴다.
generate_pdf() { # generate_pdf <from> <to> <라벨>
	local RES RID S
	RES=$(curl -s -X POST "$BASE_URL/reports/me" -H 'Content-Type: application/json' \
		-H "Authorization: Bearer $TOKEN" -d "{\"from\":\"$1\",\"to\":\"$2\"}")
	RID=$(field "$RES" "['reportId']")
	for i in $(seq 1 25); do
		S=$(curl -s "$BASE_URL/reports/me/$RID" -H "Authorization: Bearer $TOKEN" |
			python -c 'import sys,json; print(json.load(sys.stdin).get("status",""))' 2>/dev/null)
		{ [ "$S" = "COMPLETED" ] || [ "$S" = "FAILED" ]; } && break
		sleep 1
	done
	check "$3 리포트 생성 COMPLETED" "COMPLETED" "$S"
	# 다운로드는 상태 코드와 매직 넘버까지 확인한다 — 열람기한 410 같은 에러 JSON이
	# .pdf 이름으로 저장되면 "생성은 됐는데 파일이 안 열리는" 상태를 놓친다(실제로 겪음).
	local OUT HTTP
	OUT="${PDF_DIR:-/tmp}"; mkdir -p "$OUT"
	HTTP=$(curl -s -o "$OUT/$3.pdf" -w "%{http_code}" "$BASE_URL/reports/me/$RID/download" -H "Authorization: Bearer $TOKEN")
	check "$3 PDF 다운로드 200" "200" "$HTTP"
	check "$3 PDF 매직 넘버" "%PDF" "$(head -c 4 "$OUT/$3.pdf")"
	if [ -n "$PDF_DIR" ]; then
		summary "$1" | python -m json.tool > "$PDF_DIR/$3-summary.json" 2>/dev/null
		echo "  ℹ 저장: $PDF_DIR/$3.pdf (+ $3-summary.json)"
	fi
}

echo "== 주간 리포트 스모크 (시나리오 7종) =="
curl -sf -o /dev/null "${BASE_URL%/api/v1}/swagger-ui/index.html" || { echo "❌ 8081 서버 없음 — 사용법 주석 참고"; exit 1; }
# REAL_GMS=1 이면 가짜 서버 확인을 건너뛴다 — 서버가 실키(GMS_BASE_URL 없이)로 떠 있어야 하고,
# 리포트 생성 시나리오 3개에서 실제 LLM 호출 3회(비용)가 발생한다. 소견 품질 확인용.
if [ "${REAL_GMS:-0}" != "1" ]; then
	curl -s -o /dev/null -X POST "http://localhost:8082/v1/chat/completions" -d '{}' || { echo "❌ 8082 가짜 GMS 없음 — python backend/scripts/fake-gms.py (실 GMS로 돌리려면 REAL_GMS=1)"; exit 1; }
else
	echo "ℹ REAL_GMS=1 — 실제 GMS로 소견을 생성한다 (LLM 호출 3회 발생)"
fi
LEFTOVER=$(mysql_exec "SELECT COUNT(*) FROM study_records WHERE member_id=$MEMBER;")
[ "$LEFTOVER" = "0" ] || { echo "❌ 회원 $MEMBER 에게 기존 기록 $LEFTOVER 건 — 기대값이 안 맞으니 정리 후 실행"; exit 1; }

TOKEN=$(curl -s -X POST "$BASE_URL/auth/login" -H 'Content-Type: application/json' \
	-d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}" |
	python -c 'import sys,json; print(json.load(sys.stdin).get("accessToken",""))')
[ -n "$TOKEN" ] || { echo "❌ 로그인 실패($EMAIL)"; exit 1; }

cleanup
mysql_exec "INSERT INTO study_rooms (study_room_id, host_member_id, title, status) VALUES ($ROOM, $MEMBER, '리포트 스모크', 'ENDED');"

# ════ S1. 세션 종료 점수 ═══════════════════════════════════════════
# Given: 오늘 열린 세션. 순공 3000·휴식 600·자리비움 1000. 거북목 300초 + 턱 괴기 600초(겹침 없음).
# Then:  집중률 75(=3000/4000, 휴식 제외) · 목 90(=1-300/3000) · 턱 80 · 어깨 100 ·
#        종합 90(부위 3평균, 집중 미포함) · 유지율 70(=1-900/3000)
echo; echo "[S1] 세션 종료 점수 — 시간 비율·휴식 제외"
mysql_exec "
INSERT INTO study_records (study_record_id, study_room_id, member_id, study_date, joined_at,
  total_study_seconds, focused_seconds, break_seconds, away_seconds)
VALUES ($R_END1,$ROOM,$MEMBER,CURDATE(),CONCAT(CURDATE(),' 09:00:00'),0,0,0,0);
INSERT INTO events (study_record_id, event_type, detail, body_part, severity, started_at, ended_at, duration_seconds, deviation_degrees)
VALUES ($R_END1,'POSTURE','FORWARD_HEAD','NECK',5,CONCAT(CURDATE(),' 09:00:00'),CONCAT(CURDATE(),' 09:05:00'),300,14.0),
       ($R_END1,'POSTURE','CHIN_REST','NECK',4,CONCAT(CURDATE(),' 09:10:00'),CONCAT(CURDATE(),' 09:20:00'),600,NULL);"
END=$(curl -s -X PATCH "$BASE_URL/study-records/$R_END1/end" -H 'Content-Type: application/json' \
	-H "Authorization: Bearer $TOKEN" -d '{"focusedSeconds":3000,"breakSeconds":600,"awaySeconds":1000,"endReason":"USER_EXIT"}')
check "학습 집중률 75 (옛 식이면 65.22)" "75.0" "$(field "$END" "['focusScore']")"
check "목 점수 90" "90.0" "$(field "$END" "['neckScore']")"
check "턱 괴기 점수 80 (옛 감점식이면 90)" "80.0" "$(field "$END" "['chinRestScore']")"
check "어깨 균형 100 (이벤트 없음)" "100.0" "$(field "$END" "['shoulderTiltScore']")"
check "자세 종합 90 (옛 식이면 집중 섞여 86.25)" "90.0" "$(field "$END" "['totalScore']")"
check "유지율 70" "70.0" "$(field "$END" "['goodPostureRatio']")"

# ════ S2. 휴식 극단 ═══════════════════════════════════════════════
# Given: 어제 세션. 순공 1800인데 휴식이 3600(순공의 2배). 이벤트 없음.
# Then:  집중률 100 — 방이 정한 휴식은 아무리 길어도 감점이 아니다(옛 식이면 25점).
echo; echo "[S2] 휴식 극단 — 휴식은 감점이 아니다"
mysql_exec "
INSERT INTO study_records (study_record_id, study_room_id, member_id, study_date, joined_at,
  total_study_seconds, focused_seconds, break_seconds, away_seconds)
VALUES ($R_END2,$ROOM,$MEMBER,DATE_SUB(CURDATE(), INTERVAL 1 DAY),CONCAT(DATE_SUB(CURDATE(), INTERVAL 1 DAY),' 09:00:00'),0,0,0,0);"
END=$(curl -s -X PATCH "$BASE_URL/study-records/$R_END2/end" -H 'Content-Type: application/json' \
	-H "Authorization: Bearer $TOKEN" -d '{"focusedSeconds":1800,"breakSeconds":3600,"awaySeconds":0,"endReason":"USER_EXIT"}')
check "집중률 100 (옛 식이면 33.33)" "100.0" "$(field "$END" "['focusScore']")"
mysql_exec "DELETE FROM events WHERE study_record_id IN ($R_END1,$R_END2);
            DELETE FROM study_records WHERE study_record_id IN ($R_END1,$R_END2);"

# ════ S3. 첫 기록 주 + 목표 미설정 ═════════════════════════════════
# Given: 이번 주 월요일 기록 1건(순공 6000·유지율 90). 전주 기록 없음(S1·S2는 이미 삭제됨). 목표 미설정.
# Then:  전주 값이 0이 아니라 null → 가짜 "전주 대비 개선"이 생기지 않는다. 목표도 null.
echo; echo "[S3] 첫 기록 주 — 전주 null·목표 미설정"
mysql_exec "
INSERT INTO study_records (study_record_id, study_room_id, member_id, study_date, joined_at, left_at,
  total_study_seconds, focused_seconds, break_seconds, away_seconds, end_reason,
  good_posture_ratio, focus_score, neck_score, chin_rest_score, shoulder_tilt_score, total_score)
VALUES ($R_FIRST,$ROOM,$MEMBER,'$THIS_MON','$THIS_MON 09:00:00','$THIS_MON 11:00:00',7200,6000,600,600,'USER_EXIT',90.00,91.00,88.00,92.00,96.00,92.00);"
S=$(summary "$THIS_MON")
check "유지율 90" "90" "$(field "$S" "['goodPostureRatio']")"
check "전주 유지율 null" "None" "$(field "$S" "['prevWeek']['goodPostureRatio']")"
check "전주 종합 null" "None" "$(field "$S" "['prevWeek']['totalScore']")"
check "목표 달성률 null (미설정)" "None" "$(field "$S" "['goalAchievementRate']")"
generate_pdf "$THIS_MON" "$THIS_SUN" "S3-첫기록주-목표미설정"
mysql_exec "DELETE FROM study_records WHERE study_record_id=$R_FIRST;"

# ════ S4. 목표 초과 달성 ══════════════════════════════════════════
# Given: 목표 하루 360분(주 2520분). 3주 전 주에 순공 합 162000초(2700분). (PDF 없음 — 열람기한 무관)
# Then:  달성률 107%(2700/2520) + 한 줄 요약이 "목표를 달성했습니다" 문구.
echo; echo "[S4] 목표 초과 달성 — 100% 초과 허용"
mysql_exec "
INSERT INTO member_preferences (member_id, goal_minutes, onboarding_completed_at) VALUES ($MEMBER, 360, NOW());
INSERT INTO study_records (study_record_id, study_room_id, member_id, study_date, joined_at, left_at,
  total_study_seconds, focused_seconds, break_seconds, away_seconds, end_reason,
  good_posture_ratio, focus_score, neck_score, chin_rest_score, shoulder_tilt_score, total_score)
VALUES ($R_GOAL1,$ROOM,$MEMBER,'$G_D1','$G_D1 08:00:00','$G_D1 23:00:00',57600,54000,2400,1200,'USER_EXIT',85.00,95.00,90.00,90.00,90.00,90.00),
       ($R_GOAL2,$ROOM,$MEMBER,'$G_D2','$G_D2 08:00:00','$G_D2 23:00:00',57600,54000,2400,1200,'USER_EXIT',85.00,95.00,90.00,90.00,90.00,90.00),
       ($R_GOAL3,$ROOM,$MEMBER,'$G_D3','$G_D3 08:00:00','$G_D3 23:00:00',57600,54000,2400,1200,'USER_EXIT',85.00,95.00,90.00,90.00,90.00,90.00);"
S=$(summary "$G_MON")
check "달성률 107%" "107" "$(field "$S" "['goalAchievementRate']")"
contains "한 줄 요약 = 목표 달성 문구" "목표를 달성했습니다" "$(field "$S" "['summaryText']")"
mysql_exec "DELETE FROM study_records WHERE study_record_id IN ($R_GOAL1,$R_GOAL2,$R_GOAL3);"

# ════ S5. 감지 0회 + 유지율 95% ═══════════════════════════════════
# Given: 지난주 수요일 기록 1건 — 이벤트 0건인데 유지율 95(30초 미만 흐트러짐만 있던 세션의 저장값 모사).
# Then:  도넛 합계 0 + 부위 점수 100 + 유지율 95 가 공존한다(모순 아님 — 각주가 설명하는 조합).
#        PDF 는 화~목 3일짜리 커스텀 기간으로 생성한다(주 단위가 아닌 기간도 되는지 겸사 확인).
echo; echo "[S5] 감지 0회인데 유지율 95% — 30초 확정 규칙"
mysql_exec "
INSERT INTO study_records (study_record_id, study_room_id, member_id, study_date, joined_at, left_at,
  total_study_seconds, focused_seconds, break_seconds, away_seconds, end_reason,
  good_posture_ratio, focus_score, neck_score, chin_rest_score, shoulder_tilt_score, total_score)
VALUES ($R_QUIET,$ROOM,$MEMBER,'$W_WED','$W_WED 09:00:00','$W_WED 11:30:00',9000,7200,1200,600,'USER_EXIT',95.00,92.00,100.00,100.00,100.00,100.00);"
S=$(summary "$W_MON")
check "감지 합계 0회" "0" "$(field "$S" "['postureBreakdown']['total']")"
check "유지율 95 (0회여도 100 아님)" "95" "$(field "$S" "['goodPostureRatio']")"
check "목 점수 100 (확정 이벤트 없음)" "100" "$(field "$S" "['bodyPartScores']['neck']")"
generate_pdf "$W_TUE" "$W_THU" "S5-감지0회-유지율95"
mysql_exec "DELETE FROM study_records WHERE study_record_id=$R_QUIET;"

# ════ S6. 정상 주 (전주 있음) ═════════════════════════════════════
# Given: 지난주 화·수·목 3건(순공 9000·5400·10200 — 연속 3일이라 차트에 유지율 점이 선으로 이어진다)
#        + 이벤트(거북목2·턱1·졸음1) + 전주(2주 전) 수요일 1건(순공 6000·유지율 75).
# Then:  전부 순공 시간 가중 평균 — 유지율 83, 종합 89, 집중률 93, 목 82.
#        전주 원값(75·81) 그대로, 달성률 16%(410분/2520분), 4주 추세 [2]=전주 6000·[3]=이번 주 24600.
echo; echo "[S6] 정상 주 — 가중 평균·전주 비교·추세·목표"
mysql_exec "
INSERT INTO study_records (study_record_id, study_room_id, member_id, study_date, joined_at, left_at,
  total_study_seconds, focused_seconds, break_seconds, away_seconds, end_reason,
  good_posture_ratio, focus_score, neck_score, chin_rest_score, shoulder_tilt_score, total_score)
VALUES ($R_W1,$ROOM,$MEMBER,'$W_TUE','$W_TUE 09:00:00','$W_TUE 12:00:00',10800,9000,1200,600,'USER_EXIT',82.00,90.00,80.00,85.00,95.00,87.00),
       ($R_W2,$ROOM,$MEMBER,'$W_WED','$W_WED 09:00:00','$W_WED 11:00:00',7200,5400,900,900,'USER_EXIT',76.00,85.00,70.00,90.00,95.00,85.00),
       ($R_W3,$ROOM,$MEMBER,'$W_THU','$W_THU 09:00:00','$W_THU 12:00:00',10800,10200,600,0,'USER_EXIT',88.00,100.00,90.00,95.00,95.00,93.00),
       ($R_PREV,$ROOM,$MEMBER,'$PREV_WED','$PREV_WED 09:00:00','$PREV_WED 11:00:00',7200,6000,600,600,'USER_EXIT',75.00,88.00,72.00,80.00,90.00,81.00);
INSERT INTO events (study_record_id, event_type, detail, body_part, severity, started_at, ended_at, duration_seconds, deviation_degrees)
VALUES ($R_W2,'POSTURE','FORWARD_HEAD','NECK',5,'$W_WED 10:00:00','$W_WED 10:03:00',180,15.0),
       ($R_W3,'POSTURE','FORWARD_HEAD','NECK',4,'$W_THU 10:00:00','$W_THU 10:02:00',120,12.0),
       ($R_W3,'POSTURE','CHIN_REST','NECK',4,'$W_THU 10:30:00','$W_THU 10:34:00',240,NULL),
       ($R_W3,'DROWSY',NULL,NULL,3,'$W_THU 11:00:00',NULL,NULL,NULL);"
S=$(summary "$W_MON")
check "유지율 83 (가중 — 단순 평균이면 82)" "83" "$(field "$S" "['goodPostureRatio']")"
check "자세 종합 89" "89" "$(field "$S" "['totalScore']")"
check "집중률 93" "93" "$(field "$S" "['focusScore']")"
check "목 82 · 턱 90 · 어깨 95" "82/90/95" "$(field "$S" "['bodyPartScores']['neck']")/$(field "$S" "['bodyPartScores']['chinRest']")/$(field "$S" "['bodyPartScores']['shoulderTilt']")"
check "전주 유지율 75 (원값)" "75" "$(field "$S" "['prevWeek']['goodPostureRatio']")"
check "전주 종합 81" "81" "$(field "$S" "['prevWeek']['totalScore']")"
check "달성률 16%" "16" "$(field "$S" "['goalAchievementRate']")"
check "추세[2]=전주 순공 6000" "6000" "$(field "$S" "['weeklyTrend'][2]['focusedSeconds']")"
check "추세[3]=이번 주 순공 24600" "24600" "$(field "$S" "['weeklyTrend'][3]['focusedSeconds']")"
check "거북목 2회·턱 1회·졸음 1회" "2/1/1" "$(field "$S" "['postureBreakdown']['forwardHead']")/$(field "$S" "['postureBreakdown']['chinRest']")/$(field "$S" "['postureBreakdown']['drowsy']")"
generate_pdf "$W_MON" "$W_SUN" "S6-정상주-전주비교"
mysql_exec "DELETE FROM events WHERE study_record_id BETWEEN 990100 AND 990199;
            DELETE FROM study_records WHERE study_record_id BETWEEN 990100 AND 990199;"

# ════ S7. 학습 0초 기간 → 생성 거절 ════════════════════════════════
echo; echo "[S7] 학습 기록 없는 기간 — 생성 400"
CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE_URL/reports/me" -H 'Content-Type: application/json' \
	-H "Authorization: Bearer $TOKEN" -d '{"from":"2026-06-01","to":"2026-06-07"}')
check "HTTP 400" "400" "$CODE"

echo; echo "== 결과: 통과 $pass / 실패 $fail =="
[ "$fail" -eq 0 ] || exit 1
