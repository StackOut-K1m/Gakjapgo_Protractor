-- 리포트 LLM 테스트용 더미 데이터.
--
-- report_llm_test.py --source db 가 집계하는 테이블(study_records, events)을
-- 오늘 기준 최근 17일치로 채운다. 17일 = 이번 주 + 전주가 통째로 들어가는 길이라
-- "전주 대비" 문구까지 검증할 수 있다.
--
-- 실행:
--   docker run --rm -i mysql:8 mysql -hhost.docker.internal -uroot -p1234 protractor < seed_report_dummy.sql
--   (또는 Workbench 등에서 통째로 실행)
--
-- 여러 번 실행해도 안전하다 — 시작할 때 이전 더미('리포트더미%' 방)를 지우고 다시 넣는다.
-- 실데이터는 건드리지 않는다.

SET NAMES utf8mb4;

-- 대상 회원: 가장 먼저 가입한 계정 (본인 계정으로 가입해두고 실행하면 된다).
-- 계정이 하나도 없으면 아무것도 하지 않는다.
SET @member_id = (SELECT MIN(member_id) FROM members);

-- ── 0. 이전 더미 정리 (FK 순서: events → study_records → study_rooms) ──
DELETE e FROM events e
  JOIN study_records r ON r.study_record_id = e.study_record_id
  JOIN study_rooms s ON s.study_room_id = r.study_room_id
 WHERE s.title LIKE '리포트더미%';
DELETE r FROM study_records r
  JOIN study_rooms s ON s.study_room_id = r.study_room_id
 WHERE s.title LIKE '리포트더미%';
DELETE FROM study_rooms WHERE title LIKE '리포트더미%';

-- ── 1. 스트레칭 가이드 (비어 있을 때만 시드 7종 삽입) ──
INSERT INTO stretchings (name, target_part, guide_text, highlight_landmarks, hold_seconds, sort_order)
SELECT * FROM (
  SELECT '목 옆으로 기울이기' n, 'NECK' p, '어깨를 고정한 채 머리를 옆으로 기울여 늘려주세요.' g,
         '["NOSE","LEFT_EAR","RIGHT_EAR","LEFT_SHOULDER","RIGHT_SHOULDER"]' h, 5 s, 1 o
  UNION ALL SELECT '목 돌리기','NECK','고개로 큰 원을 그리듯 천천히 돌려주세요.','["NOSE","LEFT_EAR","RIGHT_EAR"]',3,2
  UNION ALL SELECT '목 대각선 스트레칭','NECK','고개를 45도 돌린 뒤 비스듬히 숙여주세요.','["NOSE","LEFT_EAR","RIGHT_EAR"]',3,3
  UNION ALL SELECT '어깨 으쓱하기','SHOULDER','양 어깨를 끌어올렸다 툭 떨어뜨려주세요.','["LEFT_SHOULDER","RIGHT_SHOULDER"]',3,4
  UNION ALL SELECT '어깨 돌리기','SHOULDER','어깨로 큰 원을 그리듯 돌려주세요.','["LEFT_SHOULDER","RIGHT_SHOULDER"]',3,5
  UNION ALL SELECT '크로스바디 스트레칭','SHOULDER','팔을 가슴 쪽으로 당겨주세요.','["LEFT_WRIST","RIGHT_WRIST"]',4,6
) seed
WHERE @member_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM stretchings LIMIT 1);

-- ── 2. 방 17개 (하루 1방 — study_records 가 (방,회원) UNIQUE 라서) ──
INSERT INTO study_rooms
  (host_member_id, title, status, room_type, max_members,
   focus_duration_seconds, break_duration_seconds, started_at, ended_at)
WITH RECURSIVE days(n) AS (
  SELECT 0 UNION ALL SELECT n + 1 FROM days WHERE n < 16
)
SELECT
  @member_id,
  CONCAT('리포트더미 D-', LPAD(n, 2, '0')),
  'ENDED', 'FOCUS', 6, 3000, 600,
  TIMESTAMP(CURDATE() - INTERVAL n DAY, '10:00:00'),
  TIMESTAMP(CURDATE() - INTERVAL n DAY, '13:30:00')
FROM days
WHERE @member_id IS NOT NULL;

-- ── 3. 세션 기록 17건 (요일마다 값이 다르도록 MOD 로 변주) ──
--   focused 90~150분, 나쁜자세 8~22분, 점수 60~95점대 사이에서 규칙적으로 흔들린다.
--   전주(n 7~13)를 이번 주(n 0~6)보다 조금 나쁘게 줘서 "개선됐다" 문구가 나오게 한다.
INSERT INTO study_records
  (study_room_id, member_id, joined_at, left_at,
   total_study_seconds, focused_seconds, break_seconds, away_seconds,
   bad_posture_seconds, end_reason, good_posture_ratio,
   focus_score, neck_score, chin_rest_score, shoulder_tilt_score, total_score,
   warning_count, stretching_attempt_count, stretching_completed_count)
SELECT
  s.study_room_id, @member_id,
  s.started_at, s.ended_at,
  fo.focused + br.brk + aw.away,
  fo.focused, br.brk, aw.away,
  bad.bad, 'COMPLETED',
  ROUND(100 - bad.bad * 100 / fo.focused, 2),
  ROUND(fo.focused * 100 / (fo.focused + br.brk + aw.away), 2),
  90 - (d.n % 4) * 6 - IF(d.n >= 7, 5, 0),   -- neck: 이번 주가 전주보다 5점 높다
  88 - (d.n % 3) * 7 - IF(d.n >= 7, 4, 0),
  92 - (d.n % 5) * 5 - IF(d.n >= 7, 3, 0),
  85 - (d.n % 4) * 4 - IF(d.n >= 7, 4, 0),
  3 + (d.n % 4) + IF(d.n >= 7, 2, 0),        -- warning: 전주가 더 많다
  1 + (d.n % 3),
  (1 + (d.n % 3)) - IF(d.n % 5 = 0, 1, 0)    -- 가끔 1회는 미완수
FROM study_rooms s
JOIN (SELECT CAST(SUBSTRING(title, 10) AS UNSIGNED) n, study_room_id FROM study_rooms
       WHERE title LIKE '리포트더미%') d ON d.study_room_id = s.study_room_id
JOIN (SELECT 0 x) dummy
CROSS JOIN LATERAL (SELECT 5400 + (d.n % 5) * 900 AS focused) fo
CROSS JOIN LATERAL (SELECT 600 + (d.n % 3) * 300 AS brk) br
CROSS JOIN LATERAL (SELECT (d.n % 4) * 150 AS away) aw
CROSS JOIN LATERAL (SELECT 480 + (d.n % 6) * 140 + IF(d.n >= 7, 300, 0) AS bad) bad
WHERE s.title LIKE '리포트더미%' AND @member_id IS NOT NULL;

-- ── 4. 감지 이벤트 — 자세(세션당 3건) ──
--   detail 은 3종을 돌아가며, duration 은 events 시간 제약(ended >= started)을 지킨다.
INSERT INTO events
  (study_record_id, event_type, detail, body_part, deviation_degrees,
   alert_channel, severity, started_at, ended_at, duration_seconds)
SELECT
  r.study_record_id, 'POSTURE',
  ELT(1 + ((d.n + k.k) % 3), 'FORWARD_HEAD', 'ROUNDED_SHOULDER', 'SHOULDER_TILT'),
  ELT(1 + ((d.n + k.k) % 3), 'NECK', 'SHOULDER', 'SHOULDER'),
  10 + ((d.n * 3 + k.k) % 12),
  'VISUAL',
  2 + ((d.n + k.k) % 3),
  r.joined_at + INTERVAL (20 + k.k * 40) MINUTE,
  r.joined_at + INTERVAL (20 + k.k * 40) MINUTE + INTERVAL (40 + (d.n % 4) * 25) SECOND,
  40 + (d.n % 4) * 25
FROM study_records r
JOIN study_rooms s ON s.study_room_id = r.study_room_id AND s.title LIKE '리포트더미%'
JOIN (SELECT CAST(SUBSTRING(title, 10) AS UNSIGNED) n, study_room_id FROM study_rooms
       WHERE title LIKE '리포트더미%') d ON d.study_room_id = r.study_room_id
JOIN (SELECT 0 k UNION ALL SELECT 1 UNION ALL SELECT 2) k
WHERE r.member_id = @member_id;

-- ── 5. 감지 이벤트 — 졸음(이틀에 한 번꼴) ──
INSERT INTO events
  (study_record_id, event_type, severity, started_at)
SELECT r.study_record_id, 'DROWSY', 2 + (d.n % 2),
       r.joined_at + INTERVAL 95 MINUTE
FROM study_records r
JOIN study_rooms s ON s.study_room_id = r.study_room_id AND s.title LIKE '리포트더미%'
JOIN (SELECT CAST(SUBSTRING(title, 10) AS UNSIGNED) n, study_room_id FROM study_rooms
       WHERE title LIKE '리포트더미%') d ON d.study_room_id = r.study_room_id
WHERE r.member_id = @member_id AND d.n % 2 = 0;

-- ── 6. 감지 이벤트 — 스트레칭 (study_records 의 attempt/completed 와 맞춘다) ──
INSERT INTO events
  (study_record_id, event_type, stretching_id, detail, completion_rate,
   started_at, ended_at, duration_seconds)
SELECT
  r.study_record_id, 'STRETCHING',
  (SELECT stretching_id FROM stretchings
    ORDER BY ((d.n + k.k) % 7) = (sort_order - 1) DESC, sort_order LIMIT 1),
  IF(k.k < r.stretching_completed_count, 'COMPLETED', 'FAILED'),
  IF(k.k < r.stretching_completed_count, 100.00, 45.00),
  r.joined_at + INTERVAL (50 + k.k * 30) MINUTE,
  r.joined_at + INTERVAL (52 + k.k * 30) MINUTE,
  120
FROM study_records r
JOIN study_rooms s ON s.study_room_id = r.study_room_id AND s.title LIKE '리포트더미%'
JOIN (SELECT CAST(SUBSTRING(title, 10) AS UNSIGNED) n, study_room_id FROM study_rooms
       WHERE title LIKE '리포트더미%') d ON d.study_room_id = r.study_room_id
JOIN (SELECT 0 k UNION ALL SELECT 1 UNION ALL SELECT 2) k
WHERE r.member_id = @member_id AND k.k < r.stretching_attempt_count;

-- ── 확인 ──
SELECT
  (SELECT COUNT(*) FROM study_rooms  WHERE title LIKE '리포트더미%')                              AS rooms,
  (SELECT COUNT(*) FROM study_records r JOIN study_rooms s ON s.study_room_id = r.study_room_id
    WHERE s.title LIKE '리포트더미%')                                                              AS records,
  (SELECT COUNT(*) FROM events e JOIN study_records r ON r.study_record_id = e.study_record_id
    JOIN study_rooms s ON s.study_room_id = r.study_room_id WHERE s.title LIKE '리포트더미%')      AS events;
