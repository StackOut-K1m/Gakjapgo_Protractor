-- 수동 운영 마이그레이션: protractor DB에 한 번만 적용한다.
USE protractor;

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
