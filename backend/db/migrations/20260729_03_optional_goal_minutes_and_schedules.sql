-- 수동 운영 마이그레이션: protractor DB에 한 번만 적용한다.
USE protractor;

ALTER TABLE member_preferences
  DROP CHECK chk_member_preferences_goal_minutes,
  MODIFY COLUMN goal_minutes INT NULL DEFAULT NULL,
  ADD CONSTRAINT chk_member_preferences_goal_minutes
    CHECK (goal_minutes IS NULL OR goal_minutes >= 1);

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
