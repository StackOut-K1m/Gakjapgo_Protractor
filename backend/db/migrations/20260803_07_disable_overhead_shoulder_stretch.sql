-- 수동 운영 마이그레이션: protractor DB에 한 번만 적용한다.
--
-- '오버헤드 어깨 스트레칭'을 끈다.
--
-- schema.sql 은 처음부터 이 동작을 시드에서 제외했다 — 팔꿈치가 얼굴 위주 화각에서 프레임을
-- 벗어나 웹캠 인식이 불안정하기 때문이다. 그런데 05 마이그레이션에만 남아 있어서, 그 파일을
-- 적용한 DB 는 이 동작을 사용자에게 내보냈다. 프론트에는 판정기가 없어서(stretchDetectors.ts
-- DETECTORS 에 항목 없음) 걸리면 supported=false 로 떨어지고, 사용자는 "따라 해도 아무 반응이
-- 없는 스트레칭"을 받는다.
--
-- DELETE 하지 않는 이유: events.stretching_id 가 이 행을 참조할 수 있다(FK). 이미 수행한
-- 기록까지 지우면 과거 리포트의 스트레칭 횟수가 바뀐다. enabled=FALSE 면 목록 조회
-- (StretchingRepository — enabled=true 만 정렬해 가져온다)에서만 빠지고 기록은 남는다.
USE protractor;
SET NAMES utf8mb4;

UPDATE stretchings
   SET enabled = FALSE
 WHERE name = '오버헤드 어깨 스트레칭';

-- 05 가 크로스바디 hold_seconds 를 7 로 넣었는데 schema.sql 은 4 다. schema.sql 을 기준으로 맞춘다.
UPDATE stretchings
   SET hold_seconds = 4
 WHERE name = '크로스바디 스트레칭'
   AND hold_seconds = 7;
