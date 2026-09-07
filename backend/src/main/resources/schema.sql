-- DROP DATABASE IF EXISTS protractor;

CREATE DATABASE IF NOT EXISTS protractor
  DEFAULT CHARACTER SET utf8mb4
  DEFAULT COLLATE utf8mb4_0900_ai_ci;

USE protractor;

-- CLI(mysql 클라이언트)로 이 파일을 실행할 때 한글 시드 데이터가 깨지지 않도록 세션 문자셋을 고정한다.
SET NAMES utf8mb4;

SET FOREIGN_KEY_CHECKS = 0;

-- 소셜 로그인(카카오/구글) 지원: provider/provider_id 추가, 소셜 가입자는 email·password가 없을 수 있어 NULL 허용.
-- 기존 DB에 적용할 ALTER:
--   ALTER TABLE members
--     MODIFY email VARCHAR(100) NULL,
--     MODIFY password VARCHAR(255) NULL,
--     ADD COLUMN provider VARCHAR(20) NOT NULL DEFAULT 'LOCAL' AFTER nickname,
--     ADD COLUMN provider_id VARCHAR(100) NULL AFTER provider,
--     ADD UNIQUE KEY uk_members_provider (provider, provider_id);
CREATE TABLE members (
  member_id BIGINT NOT NULL AUTO_INCREMENT,
  email VARCHAR(100) NULL,
  password VARCHAR(255) NULL,
  nickname VARCHAR(50) NOT NULL,
  provider VARCHAR(20) NOT NULL DEFAULT 'LOCAL',
  provider_id VARCHAR(100) NULL,
  profile_image_url VARCHAR(1000) NULL,
  role ENUM('MEMBER', 'ADMIN') NOT NULL DEFAULT 'MEMBER',
  account_status VARCHAR(30) NOT NULL DEFAULT 'ACTIVE',
  deleted_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (member_id),
  UNIQUE KEY uk_members_email (email),
  UNIQUE KEY uk_members_provider (provider, provider_id),
  KEY idx_members_deleted_at (deleted_at),
  KEY idx_members_account_status (account_status),
  CONSTRAINT chk_members_account_status_not_blank
    CHECK (CHAR_LENGTH(TRIM(account_status)) > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE study_tags (
  study_tag_id BIGINT NOT NULL AUTO_INCREMENT,
  name VARCHAR(50) NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (study_tag_id),
  UNIQUE KEY uk_study_tags_name (name),
  KEY idx_study_tags_enabled (enabled)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- 온보딩·프로필·스터디룸에서 공용으로 쓰는 기본 관심 태그.
-- 이름에 UNIQUE가 있어 INSERT IGNORE는 여러 번 실행해도 안전하다.
-- (테이블이 이미 있는 기존 DB에는 아래 INSERT 한 줄만 실행하면 된다)
INSERT IGNORE INTO study_tags (name) VALUES
  ('수능'), ('공무원'), ('취업'), ('자격증'), ('어학'), ('IT·개발'), ('독서'), ('자기계발');

CREATE TABLE stretchings (
  stretching_id BIGINT NOT NULL AUTO_INCREMENT,
  name VARCHAR(100) NOT NULL,
  target_part VARCHAR(50) NOT NULL,
  guide_text TEXT NOT NULL,
  highlight_landmarks JSON NULL,
  hold_seconds INT NOT NULL DEFAULT 30,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INT NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (stretching_id),
  -- 이름이 곧 동작의 식별자다. UNIQUE가 있어야 아래 시드 INSERT IGNORE를 여러 번 돌려도 안전하다.
  -- (테이블이 이미 있는 기존 DB에는 아래 한 줄만 실행하면 된다)
  --   ALTER TABLE stretchings ADD UNIQUE KEY uk_stretchings_name (name);
  -- 이름이 동작 식별자이며, 시드 재실행 시 중복을 막는다.
  UNIQUE KEY uk_stretchings_name (name),
  KEY idx_stretchings_target_part (target_part),
  KEY idx_stretchings_enabled_sort_order (enabled, sort_order),
  CONSTRAINT chk_stretchings_name_not_blank
    CHECK (CHAR_LENGTH(TRIM(name)) > 0),
  CONSTRAINT chk_stretchings_target_part_not_blank
    CHECK (CHAR_LENGTH(TRIM(target_part)) > 0),
  CONSTRAINT chk_stretchings_guide_text_not_blank
    CHECK (CHAR_LENGTH(TRIM(guide_text)) > 0),
  CONSTRAINT chk_stretchings_hold_seconds
    CHECK (hold_seconds > 0),
  CONSTRAINT chk_stretchings_sort_order
    CHECK (sort_order >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- 스트레칭 가이드 기본 데이터.
-- ai/src/neckStrech, ai/src/shoulderStrech 의 MediaPipe 인식 스크립트와 1:1로 대응한다.
-- 나쁜 자세가 감지되면 부위(target_part)에 맞는 동작 중 하나를 뽑아 사용자에게 시킨다.
-- highlight_landmarks 는 화면에서 강조할 MediaPipe Pose 랜드마크 이름이다.
-- 이름에 UNIQUE가 있어 INSERT IGNORE는 여러 번 실행해도 안전하다.
-- (테이블이 이미 있는 기존 DB에는 아래 INSERT만 실행하면 된다)
INSERT IGNORE INTO stretchings (name, target_part, guide_text, highlight_landmarks, hold_seconds, sort_order) VALUES
  ('목 옆으로 기울이기', 'NECK',
   '어깨를 고정한 채 머리를 왼쪽으로 천천히 기울여 귀를 어깨에 붙인다는 느낌으로 늘려주세요. 반대쪽도 같은 방법으로 반복합니다.',
   '["NOSE","LEFT_EAR","RIGHT_EAR","LEFT_SHOULDER","RIGHT_SHOULDER"]', 5, 1),
  ('목 돌리기', 'NECK',
   '고개로 큰 원을 그린다는 느낌으로 천천히 한 바퀴 돌려주세요. 반대 방향으로도 돌려줍니다.',
   '["NOSE","LEFT_EAR","RIGHT_EAR","LEFT_SHOULDER","RIGHT_SHOULDER"]', 3, 2),
  ('목 대각선 스트레칭', 'NECK',
   '고개를 45도 옆으로 돌린 뒤 그 방향으로 비스듬히 숙여 목 뒤쪽을 늘려주세요. 반대쪽도 반복합니다.',
   '["NOSE","LEFT_EAR","RIGHT_EAR","LEFT_SHOULDER","RIGHT_SHOULDER"]', 3, 3),
  ('어깨 으쓱하기', 'SHOULDER',
   '양 어깨를 귀 쪽으로 끝까지 끌어올려 2초간 멈춘 뒤, 힘을 빼고 툭 떨어뜨립니다.',
   '["LEFT_SHOULDER","RIGHT_SHOULDER","LEFT_EAR","RIGHT_EAR"]', 3, 4),
  ('어깨 돌리기', 'SHOULDER',
   '양 어깨로 큰 원을 그리듯 뒤쪽으로 천천히 돌려주세요.',
   '["LEFT_SHOULDER","RIGHT_SHOULDER","LEFT_ELBOW","RIGHT_ELBOW"]', 3, 5),
  ('크로스바디 스트레칭', 'SHOULDER',
   '한쪽 팔을 몸 앞으로 쭉 뻗어 가슴 쪽으로 당기고, 반대 팔로 감싸 눌러줍니다. 양쪽 모두 반복합니다.',
   '["LEFT_SHOULDER","RIGHT_SHOULDER","LEFT_ELBOW","RIGHT_ELBOW","LEFT_WRIST","RIGHT_WRIST"]', 4, 6);

-- 제외한 동작 (웹캠 인식이 불안정해 시드에서 뺐다. 스크립트는 ai/src/shoulderStrech 에 남아 있다)
--   오버헤드 어깨 스트레칭 — 팔꿈치가 얼굴 위주 화각에서 프레임을 벗어난다
--   가슴 펴기             — 어깨너비 변화가 작아 정면에서만 겨우 잡힌다

CREATE TABLE study_rooms (
  study_room_id BIGINT NOT NULL AUTO_INCREMENT,
  host_member_id BIGINT NOT NULL,
  -- 방은 공용 study_tags 사전에서 하나의 카테고리만 선택한다.
  study_tag_id BIGINT NOT NULL DEFAULT 8,
  title VARCHAR(100) NOT NULL,
  status ENUM('WAITING', 'RUNNING', 'ENDED') NOT NULL DEFAULT 'WAITING',
  room_type VARCHAR(30) NOT NULL DEFAULT 'FOCUS',
  max_members INT NOT NULL DEFAULT 6,
  planned_duration_seconds INT NULL,
  focus_duration_seconds INT NOT NULL DEFAULT 3000,
  break_duration_seconds INT NOT NULL DEFAULT 600,
  stretching_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  -- 해시태그는 검색·추천용 태그와 무관한 자유 입력 문자열이다.
  hash_tags VARCHAR(500) NULL,
  is_locked BOOLEAN NOT NULL DEFAULT FALSE,
  -- 잠금 방의 비밀번호. 해시 정책 전환 시 별도 마이그레이션으로 변경한다.
  password VARCHAR(255) NULL,
  rules TEXT NULL,
  description TEXT NULL,
  thumbnail_image_url VARCHAR(1000) NULL,
  started_at DATETIME NULL,
  ended_at DATETIME NULL,
  expires_at DATETIME NULL,
  end_reason VARCHAR(50) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at DATETIME NULL,
  PRIMARY KEY (study_room_id),
  KEY idx_study_rooms_host_member_id (host_member_id),
  KEY idx_study_rooms_study_tag_id (study_tag_id),
  KEY idx_study_rooms_status (status),
  KEY idx_study_rooms_room_type (room_type),
  KEY idx_study_rooms_expires_at (expires_at),
  KEY idx_study_rooms_deleted_at (deleted_at),
  CONSTRAINT fk_study_rooms_host_member
    FOREIGN KEY (host_member_id) REFERENCES members(member_id)
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_study_rooms_study_tag
    FOREIGN KEY (study_tag_id) REFERENCES study_tags(study_tag_id)
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT chk_study_rooms_max_members
    CHECK (max_members > 0),
  CONSTRAINT chk_study_rooms_planned_duration
    CHECK (planned_duration_seconds IS NULL OR planned_duration_seconds >= 0),
  CONSTRAINT chk_study_rooms_focus_duration
    CHECK (focus_duration_seconds > 0),
  CONSTRAINT chk_study_rooms_break_duration
    CHECK (break_duration_seconds >= 0),
  CONSTRAINT chk_study_rooms_time_order
    CHECK (ended_at IS NULL OR started_at IS NULL OR ended_at >= started_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE posts (
  post_id BIGINT NOT NULL AUTO_INCREMENT,
  author_member_id BIGINT NOT NULL,
  category VARCHAR(50) NULL,
  title VARCHAR(200) NOT NULL,
  content TEXT NOT NULL,
  status ENUM('PUBLISHED', 'HIDDEN') NOT NULL DEFAULT 'PUBLISHED',
  view_count INT NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at DATETIME NULL,
  PRIMARY KEY (post_id),
  KEY idx_posts_author_member_id (author_member_id),
  KEY idx_posts_status_created_at (status, created_at),
  KEY idx_posts_created_at (created_at),
  KEY idx_posts_deleted_at (deleted_at),
  KEY idx_posts_category_created_at (category, created_at),
  CONSTRAINT fk_posts_author_member
    FOREIGN KEY (author_member_id) REFERENCES members(member_id)
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT chk_posts_title_not_blank
    CHECK (CHAR_LENGTH(TRIM(title)) > 0),
  CONSTRAINT chk_posts_content_not_blank
    CHECK (CHAR_LENGTH(TRIM(content)) > 0),
  CONSTRAINT chk_posts_view_count
    CHECK (view_count >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE member_preferences (
  member_id BIGINT NOT NULL,
  study_purpose VARCHAR(100) NULL,
  goal_text VARCHAR(255) NULL,
  goal_minutes INT NULL,
  posture_detection_consent BOOLEAN NOT NULL DEFAULT FALSE,
  drowsiness_detection_consent BOOLEAN NOT NULL DEFAULT FALSE,
  posture_capture_consent BOOLEAN NOT NULL DEFAULT FALSE,
  consent_updated_at DATETIME NULL,
  onboarding_completed_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (member_id),
  CONSTRAINT fk_member_preferences_member
    FOREIGN KEY (member_id) REFERENCES members(member_id)
    ON DELETE CASCADE ON UPDATE RESTRICT,
  CONSTRAINT chk_member_preferences_goal_minutes
    CHECK (goal_minutes IS NULL OR goal_minutes >= 1)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- 온보딩 1단계 "공부 목적" 다중 선택 저장. 회원당 목적 수만큼 한 줄씩 쌓인다.
-- 선택지는 study_tags 이름과 같은 고정 목록(온보딩 선택지 API가 내려줌)을 쓴다.
-- 기존 member_preferences.study_purpose(단수) 컬럼은 이 테이블로 대체되어 더 이상 쓰지 않는다.
-- (테이블이 없는 기존 DB에는 이 CREATE TABLE만 실행하면 된다)
CREATE TABLE member_purposes (
  member_id BIGINT NOT NULL,
  purpose VARCHAR(50) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (member_id, purpose),
  CONSTRAINT fk_member_purposes_member
    FOREIGN KEY (member_id) REFERENCES members(member_id)
    ON DELETE CASCADE ON UPDATE RESTRICT,
  CONSTRAINT chk_member_purposes_purpose_not_blank
    CHECK (CHAR_LENGTH(TRIM(purpose)) > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- 회원별 알림 유형 수신 설정. 행이 없는 기존 회원은 모든 유형 수신으로 간주한다.
CREATE TABLE member_notification_settings (
  member_id BIGINT NOT NULL,
  friend_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  dm_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  community_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  inquiry_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  notice_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  report_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  ranking_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (member_id),
  CONSTRAINT fk_member_notification_settings_member
    FOREIGN KEY (member_id) REFERENCES members(member_id)
    ON DELETE CASCADE ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- 개인 일정과 홈 대시보드 D-Day 표시를 위한 캘린더 데이터.
CREATE TABLE schedules (
  schedule_id BIGINT NOT NULL AUTO_INCREMENT,
  member_id BIGINT NOT NULL,
  title VARCHAR(100) NOT NULL,
  target_date DATE NOT NULL,
  color VARCHAR(20) NULL,
  d_day_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  memo VARCHAR(500) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (schedule_id),
  KEY idx_schedules_member_target_date (member_id, target_date),
  KEY idx_schedules_member_dday (member_id, d_day_enabled, target_date),
  CONSTRAINT fk_schedules_member
    FOREIGN KEY (member_id) REFERENCES members(member_id)
    ON DELETE CASCADE ON UPDATE RESTRICT,
  CONSTRAINT chk_schedules_title_not_blank
    CHECK (CHAR_LENGTH(TRIM(title)) > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE calibrations (
  calibration_id BIGINT NOT NULL AUTO_INCREMENT,
  member_id BIGINT NOT NULL,
  baseline_data JSON NOT NULL,
  capture_url VARCHAR(1000) NULL,
  confidence DECIMAL(5,2) NULL,
  calibrated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (calibration_id),
  UNIQUE KEY uk_calibrations_member_id (member_id),
  KEY idx_calibrations_calibrated_at (calibrated_at),
  CONSTRAINT fk_calibrations_member
    FOREIGN KEY (member_id) REFERENCES members(member_id)
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT chk_calibrations_confidence
    CHECK (confidence IS NULL OR confidence BETWEEN 0 AND 100)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE friendships (
  friendship_id BIGINT NOT NULL AUTO_INCREMENT,
  requester_member_id BIGINT NOT NULL,
  addressee_member_id BIGINT NOT NULL,
  status ENUM('PENDING', 'ACCEPTED', 'REJECTED', 'BLOCKED') NOT NULL DEFAULT 'PENDING',
  requested_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  responded_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  pair_member_id_low BIGINT GENERATED ALWAYS AS (LEAST(requester_member_id, addressee_member_id)) STORED,
  pair_member_id_high BIGINT GENERATED ALWAYS AS (GREATEST(requester_member_id, addressee_member_id)) STORED,
  PRIMARY KEY (friendship_id),
  UNIQUE KEY uk_friendships_member_pair (pair_member_id_low, pair_member_id_high),
  KEY idx_friendships_requester_member_id (requester_member_id),
  KEY idx_friendships_addressee_member_id (addressee_member_id),
  KEY idx_friendships_status (status),
  CONSTRAINT fk_friendships_requester_member
    FOREIGN KEY (requester_member_id) REFERENCES members(member_id)
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_friendships_addressee_member
    FOREIGN KEY (addressee_member_id) REFERENCES members(member_id)
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT chk_friendships_not_self
    CHECK (requester_member_id <> addressee_member_id),
  CONSTRAINT chk_friendships_response_time
    CHECK (
      (status = 'PENDING' AND responded_at IS NULL)
      OR
      (status <> 'PENDING' AND responded_at IS NOT NULL)
    ),
  CONSTRAINT chk_friendships_time_order
    CHECK (responded_at IS NULL OR responded_at >= requested_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- 친구 관계와 별개로 보존되는 1:1 DM 방. 회원 쌍은 순서와 무관하게 하나만 허용한다.
CREATE TABLE dm_rooms (
  dm_room_id BIGINT NOT NULL AUTO_INCREMENT,
  member_id_low BIGINT NOT NULL,
  member_id_high BIGINT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (dm_room_id),
  UNIQUE KEY uk_dm_rooms_member_pair (member_id_low, member_id_high),
  KEY idx_dm_rooms_member_low (member_id_low),
  KEY idx_dm_rooms_member_high (member_id_high),
  CONSTRAINT fk_dm_rooms_member_low FOREIGN KEY (member_id_low) REFERENCES members(member_id)
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_dm_rooms_member_high FOREIGN KEY (member_id_high) REFERENCES members(member_id)
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT chk_dm_rooms_member_order CHECK (member_id_low < member_id_high)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE dm_messages (
  dm_message_id BIGINT NOT NULL AUTO_INCREMENT,
  dm_room_id BIGINT NOT NULL,
  sender_member_id BIGINT NOT NULL,
  content TEXT NOT NULL,
  read_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (dm_message_id),
  KEY idx_dm_messages_room_created (dm_room_id, created_at, dm_message_id),
  KEY idx_dm_messages_room_unread (dm_room_id, sender_member_id, read_at),
  CONSTRAINT fk_dm_messages_room FOREIGN KEY (dm_room_id) REFERENCES dm_rooms(dm_room_id)
    ON DELETE CASCADE ON UPDATE RESTRICT,
  CONSTRAINT fk_dm_messages_sender FOREIGN KEY (sender_member_id) REFERENCES members(member_id)
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT chk_dm_messages_content_not_blank CHECK (CHAR_LENGTH(TRIM(content)) > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE notifications (
  notification_id BIGINT NOT NULL AUTO_INCREMENT,
  receiver_member_id BIGINT NOT NULL,
  sender_member_id BIGINT NULL,
  type VARCHAR(50) NOT NULL,
  title VARCHAR(200) NOT NULL,
  message VARCHAR(500) NULL,
  reference_type VARCHAR(50) NULL,
  reference_id BIGINT NULL,
  read_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (notification_id),
  KEY idx_notifications_receiver_created_at (receiver_member_id, created_at),
  KEY idx_notifications_receiver_read_at (receiver_member_id, read_at),
  KEY idx_notifications_type (type),
  KEY idx_notifications_reference (reference_type, reference_id),
  KEY idx_notifications_sender_member_id (sender_member_id),
  CONSTRAINT fk_notifications_receiver_member
    FOREIGN KEY (receiver_member_id) REFERENCES members(member_id)
    ON DELETE CASCADE ON UPDATE RESTRICT,
  CONSTRAINT fk_notifications_sender_member
    FOREIGN KEY (sender_member_id) REFERENCES members(member_id)
    ON DELETE SET NULL ON UPDATE RESTRICT,
  CONSTRAINT chk_notifications_type_not_blank
    CHECK (CHAR_LENGTH(TRIM(type)) > 0),
  CONSTRAINT chk_notifications_title_not_blank
    CHECK (CHAR_LENGTH(TRIM(title)) > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE reports (
  report_id BIGINT NOT NULL AUTO_INCREMENT,
  member_id BIGINT NOT NULL,
  report_title VARCHAR(200) NULL,
  period_start_date DATE NOT NULL,
  period_end_date DATE NOT NULL,
  status ENUM('PENDING', 'RUNNING', 'COMPLETED', 'FAILED') NOT NULL DEFAULT 'PENDING',
  input_data JSON NULL,
  summary_metrics JSON NULL,
  summary_text TEXT NULL,
  pdf_url VARCHAR(1000) NULL,
  pdf_url_expires_at DATETIME NULL,
  pdf_deleted_at DATETIME NULL,
  model_name VARCHAR(100) NULL,
  prompt_version VARCHAR(50) NULL,
  error_message VARCHAR(1000) NULL,
  requested_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  started_at DATETIME NULL,
  completed_at DATETIME NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (report_id),
  KEY idx_reports_member_id (member_id),
  KEY idx_reports_member_period (member_id, period_start_date, period_end_date),
  KEY idx_reports_status_requested_at (status, requested_at),
  KEY idx_reports_pdf_url_expires_at (pdf_url_expires_at),
  CONSTRAINT fk_reports_member
    FOREIGN KEY (member_id) REFERENCES members(member_id)
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT chk_reports_period
    CHECK (period_end_date >= period_start_date),
  CONSTRAINT chk_reports_started_at
    CHECK (started_at IS NULL OR started_at >= requested_at),
  CONSTRAINT chk_reports_completed_at
    CHECK (completed_at IS NULL OR started_at IS NULL OR completed_at >= started_at),
  CONSTRAINT chk_reports_pdf_deleted_after_completed
    CHECK (pdf_deleted_at IS NULL OR completed_at IS NULL OR pdf_deleted_at >= completed_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE study_records (
  study_record_id BIGINT NOT NULL AUTO_INCREMENT,
  study_room_id BIGINT NOT NULL,
  member_id BIGINT NOT NULL,
  -- 이 기록이 "며칠의 공부"인지. 랭킹·리포트·알림·학습요약이 기간을 자를 때 쓰는 기준이다.
  -- joined_at으로 자르면 자정을 넘긴 학습이 시작한 날에 통째로 붙는다(23시~1시가 전부 어제).
  -- 자정을 지나면 서버가 이 행을 마감하고 다음 날짜로 새 행을 만든다.
  -- ※ 신규 컬럼(2026-08-03, 자정 분할) — DB 담당 마이그레이션 반영 필요.
  study_date DATE NOT NULL,
  joined_at DATETIME NULL,
  left_at DATETIME NULL,
  total_study_seconds INT NOT NULL DEFAULT 0,
  focused_seconds INT NOT NULL DEFAULT 0,
  break_seconds INT NOT NULL DEFAULT 0,
  away_seconds INT NOT NULL DEFAULT 0,
  bad_posture_seconds INT NOT NULL DEFAULT 0,
  end_reason VARCHAR(50) NULL,
  good_posture_ratio DECIMAL(5,2) NULL,
  focus_score DECIMAL(5,2) NULL,
  neck_score DECIMAL(5,2) NULL,
  chin_rest_score DECIMAL(5,2) NULL,
  shoulder_tilt_score DECIMAL(5,2) NULL,
  total_score DECIMAL(5,2) NULL,
  warning_count INT NOT NULL DEFAULT 0,
  stretching_attempt_count INT NOT NULL DEFAULT 0,
  stretching_completed_count INT NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (study_record_id),
  -- 기록 단위는 "방 × 회원 × 학습일"이다. 같은 방이라도 날짜가 다르면 다른 행이 된다.
  -- 하루 안에서는 재입장해도 같은 행에 이어 쌓는다(rejoin).
  UNIQUE KEY uk_study_records_room_member_date (study_room_id, member_id, study_date),
  KEY idx_study_records_member_study_date (member_id, study_date),
  KEY idx_study_records_study_room_id (study_room_id),
  KEY idx_study_records_member_id (member_id),
  KEY idx_study_records_member_joined_at (member_id, joined_at),
  -- 랭킹은 확정된 기록을 left_at 기간으로 자른 뒤 member_id별로 합산한다.
  KEY idx_study_records_left_at_member_id (left_at, member_id),
  KEY idx_study_records_room_left_at (study_room_id, left_at),
  KEY idx_study_records_room_member_active (study_room_id, member_id, left_at, study_record_id),
  KEY idx_study_records_room_joined_at (study_room_id, joined_at),
  CONSTRAINT fk_study_records_study_room
    FOREIGN KEY (study_room_id) REFERENCES study_rooms(study_room_id)
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_study_records_member
    FOREIGN KEY (member_id) REFERENCES members(member_id)
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT chk_study_records_total_seconds
    CHECK (total_study_seconds >= 0),
  CONSTRAINT chk_study_records_focused_seconds
    CHECK (focused_seconds >= 0),
  CONSTRAINT chk_study_records_break_seconds
    CHECK (break_seconds >= 0),
  CONSTRAINT chk_study_records_away_seconds
    CHECK (away_seconds >= 0),
  CONSTRAINT chk_study_records_bad_posture_seconds
    CHECK (bad_posture_seconds >= 0),
  CONSTRAINT chk_study_records_focused_within_total
    CHECK (focused_seconds <= total_study_seconds),
  CONSTRAINT chk_study_records_break_within_total
    CHECK (break_seconds <= total_study_seconds),
  CONSTRAINT chk_study_records_away_within_total
    CHECK (away_seconds <= total_study_seconds),
  CONSTRAINT chk_study_records_bad_posture_within_total
    CHECK (bad_posture_seconds <= total_study_seconds),
  CONSTRAINT chk_study_records_time_order
    CHECK (left_at IS NULL OR joined_at IS NULL OR left_at >= joined_at),
  CONSTRAINT chk_study_records_good_posture_ratio
    CHECK (good_posture_ratio IS NULL OR good_posture_ratio BETWEEN 0 AND 100),
  CONSTRAINT chk_study_records_focus_score
    CHECK (focus_score IS NULL OR focus_score BETWEEN 0 AND 100),
  CONSTRAINT chk_study_records_neck_score
    CHECK (neck_score IS NULL OR neck_score BETWEEN 0 AND 100),
  CONSTRAINT chk_study_records_chin_rest_score
    CHECK (chin_rest_score IS NULL OR chin_rest_score BETWEEN 0 AND 100),
  CONSTRAINT chk_study_records_shoulder_tilt_score
    CHECK (shoulder_tilt_score IS NULL OR shoulder_tilt_score BETWEEN 0 AND 100),
  CONSTRAINT chk_study_records_total_score
    CHECK (total_score IS NULL OR total_score BETWEEN 0 AND 100),
  CONSTRAINT chk_study_records_warning_count
    CHECK (warning_count >= 0),
  CONSTRAINT chk_study_records_stretching_attempt_count
    CHECK (stretching_attempt_count >= 0),
  CONSTRAINT chk_study_records_stretching_completed_count
    CHECK (stretching_completed_count >= 0),
  CONSTRAINT chk_study_records_stretching_completed_within_attempt
    CHECK (stretching_completed_count <= stretching_attempt_count)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE study_room_phase_records (
  study_room_phase_record_id BIGINT NOT NULL AUTO_INCREMENT,
  study_room_id BIGINT NOT NULL,
  phase_type VARCHAR(30) NOT NULL,
  sequence INT NOT NULL,
  started_at DATETIME NOT NULL,
  ended_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (study_room_phase_record_id),
  UNIQUE KEY uk_study_room_phase_records_room_sequence (study_room_id, sequence),
  KEY idx_study_room_phase_records_room_started_at (study_room_id, started_at),
  KEY idx_study_room_phase_records_phase_type (phase_type),
  CONSTRAINT fk_study_room_phase_records_study_room
    FOREIGN KEY (study_room_id) REFERENCES study_rooms(study_room_id)
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT chk_study_room_phase_records_sequence
    CHECK (sequence > 0),
  CONSTRAINT chk_study_room_phase_records_time_order
    CHECK (ended_at IS NULL OR ended_at >= started_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE member_study_tags (
  member_id BIGINT NOT NULL,
  study_tag_id BIGINT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (member_id, study_tag_id),
  KEY idx_member_study_tags_tag_member (study_tag_id, member_id),
  CONSTRAINT fk_member_study_tags_member
    FOREIGN KEY (member_id) REFERENCES members(member_id)
    ON DELETE CASCADE ON UPDATE RESTRICT,
  CONSTRAINT fk_member_study_tags_study_tag
    FOREIGN KEY (study_tag_id) REFERENCES study_tags(study_tag_id)
    ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE comments (
  comment_id BIGINT NOT NULL AUTO_INCREMENT,
  post_id BIGINT NOT NULL,
  author_member_id BIGINT NOT NULL,
  content TEXT NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'PUBLISHED',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at DATETIME NULL,
  PRIMARY KEY (comment_id),
  KEY idx_comments_post_id (post_id),
  KEY idx_comments_author_member_id (author_member_id),
  KEY idx_comments_post_created_at (post_id, created_at),
  KEY idx_comments_deleted_at (deleted_at),
  KEY idx_comments_status_created_at (status, created_at),
  CONSTRAINT fk_comments_post
    FOREIGN KEY (post_id) REFERENCES posts(post_id)
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_comments_author_member
    FOREIGN KEY (author_member_id) REFERENCES members(member_id)
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT chk_comments_content_not_blank
    CHECK (CHAR_LENGTH(TRIM(content)) > 0),
  CONSTRAINT chk_comments_status_not_blank
    CHECK (CHAR_LENGTH(TRIM(status)) > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- 게시글 첨부파일 메타데이터. 실물 파일은 app.board.upload-dir(기본 ./data/uploads/posts)에
-- stored_name(UUID)으로 저장된다. ※ 신규 테이블(2026-08-02, 게시판 기능) — DB 담당 마이그레이션 반영 필요.
CREATE TABLE post_attachments (
  attachment_id BIGINT NOT NULL AUTO_INCREMENT,
  post_id BIGINT NOT NULL,
  original_name VARCHAR(255) NOT NULL,
  stored_name VARCHAR(100) NOT NULL,
  content_type VARCHAR(100) NULL,
  file_size BIGINT NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (attachment_id),
  UNIQUE KEY uk_post_attachments_stored_name (stored_name),
  KEY idx_post_attachments_post_id (post_id),
  CONSTRAINT fk_post_attachments_post
    FOREIGN KEY (post_id) REFERENCES posts(post_id)
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT chk_post_attachments_file_size
    CHECK (file_size >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE events (
  event_id BIGINT NOT NULL AUTO_INCREMENT,
  study_record_id BIGINT NOT NULL,
  study_room_phase_record_id BIGINT NULL,
  stretching_id BIGINT NULL,
  event_type VARCHAR(30) NOT NULL,
  detail VARCHAR(50) NULL,
  body_part VARCHAR(30) NULL,
  deviation_degrees DECIMAL(6,2) NULL,
  alert_channel VARCHAR(30) NULL,
  resolved_by VARCHAR(30) NULL,
  severity TINYINT NULL,
  started_at DATETIME NOT NULL,
  ended_at DATETIME NULL,
  duration_seconds INT NULL,
  completion_rate DECIMAL(5,2) NULL,
  capture_url VARCHAR(1000) NULL,
  -- metadata에는 PostureFeatures(캘리브레이션) + detector 이름(판정 방식) + 버전
  metadata JSON NULL, 
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (event_id),
  KEY idx_events_study_record_id (study_record_id),
  KEY idx_events_study_room_phase_record_id (study_room_phase_record_id),
  KEY idx_events_stretching_id (stretching_id),
  KEY idx_events_event_type (event_type),
  KEY idx_events_started_at (started_at),
  KEY idx_events_record_started_at (study_record_id, started_at),
  KEY idx_events_record_type_started_at (study_record_id, event_type, started_at),
  KEY idx_events_capture_url (capture_url(255)),
  CONSTRAINT fk_events_study_record
    FOREIGN KEY (study_record_id) REFERENCES study_records(study_record_id)
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_events_study_room_phase_record
    FOREIGN KEY (study_room_phase_record_id) REFERENCES study_room_phase_records(study_room_phase_record_id)
    ON DELETE SET NULL ON UPDATE RESTRICT,
  CONSTRAINT fk_events_stretching
    FOREIGN KEY (stretching_id) REFERENCES stretchings(stretching_id)
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT chk_events_severity
    CHECK (severity IS NULL OR severity BETWEEN 1 AND 5),
  CONSTRAINT chk_events_time_order
    CHECK (ended_at IS NULL OR ended_at >= started_at),
  CONSTRAINT chk_events_duration
    CHECK (duration_seconds IS NULL OR duration_seconds >= 0),
  CONSTRAINT chk_events_completion_rate
    CHECK (completion_rate IS NULL OR completion_rate BETWEEN 0 AND 100),
  CONSTRAINT chk_events_deviation_degrees
    CHECK (deviation_degrees IS NULL OR deviation_degrees >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

SET FOREIGN_KEY_CHECKS = 1;
