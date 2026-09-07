-- 수동 운영 마이그레이션: protractor DB에 한 번만 적용한다.
--
-- 주의: 이 파일에는 '오버헤드 어깨 스트레칭'이 들어 있었다. schema.sql 은 처음부터 그 동작을
-- 시드에서 제외했는데(웹캠 인식이 불안정) 여기만 남아 있어서, 이 파일을 적용한 DB 에만
-- 판정기 없는 동작이 사용자에게 나갔다. 아래 INSERT 에서 지웠고, 이미 적용한 DB 는
-- 20260803_07_disable_overhead_shoulder_stretch.sql 로 끈다.
USE protractor;
SET NAMES utf8mb4;

ALTER TABLE stretchings
  ADD UNIQUE KEY uk_stretchings_name (name);

INSERT IGNORE INTO stretchings (name, target_part, guide_text, highlight_landmarks, hold_seconds, sort_order) VALUES
  ('목 옆으로 기울이기', 'NECK', '어깨를 고정한 채 머리를 왼쪽으로 천천히 기울여 귀를 어깨에 붙인다는 느낌으로 늘려주세요. 반대쪽도 같은 방법으로 반복합니다.', '["NOSE","LEFT_EAR","RIGHT_EAR","LEFT_SHOULDER","RIGHT_SHOULDER"]', 5, 1),
  ('목 돌리기', 'NECK', '고개로 큰 원을 그린다는 느낌으로 천천히 한 바퀴 돌려주세요. 반대 방향으로도 돌려줍니다.', '["NOSE","LEFT_EAR","RIGHT_EAR","LEFT_SHOULDER","RIGHT_SHOULDER"]', 3, 2),
  ('목 대각선 스트레칭', 'NECK', '고개를 45도 옆으로 돌린 뒤 그 방향으로 비스듬히 숙여 목 뒤쪽을 늘려주세요. 반대쪽도 반복합니다.', '["NOSE","LEFT_EAR","RIGHT_EAR","LEFT_SHOULDER","RIGHT_SHOULDER"]', 3, 3),
  ('어깨 으쓱하기', 'SHOULDER', '양 어깨를 귀 쪽으로 끝까지 끌어올려 2초간 멈춘 뒤, 힘을 빼고 툭 떨어뜨립니다.', '["LEFT_SHOULDER","RIGHT_SHOULDER","LEFT_EAR","RIGHT_EAR"]', 3, 4),
  ('어깨 돌리기', 'SHOULDER', '양 어깨로 큰 원을 그리듯 뒤쪽으로 천천히 돌려주세요.', '["LEFT_SHOULDER","RIGHT_SHOULDER","LEFT_ELBOW","RIGHT_ELBOW"]', 3, 5),
  ('크로스바디 스트레칭', 'SHOULDER', '한쪽 팔을 몸 앞으로 쭉 뻗어 가슴 쪽으로 당기고, 반대 팔로 감싸 눌러줍니다. 양쪽 모두 반복합니다.', '["LEFT_SHOULDER","RIGHT_SHOULDER","LEFT_ELBOW","RIGHT_ELBOW","LEFT_WRIST","RIGHT_WRIST"]', 4, 6);
