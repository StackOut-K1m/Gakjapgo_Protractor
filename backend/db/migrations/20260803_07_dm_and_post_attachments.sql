-- Existing protractor DB migration for direct messages and post attachments (MySQL 8).
-- Fresh databases are created directly from backend/src/main/resources/schema.sql.

USE protractor;

CREATE TABLE IF NOT EXISTS dm_rooms (
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

CREATE TABLE IF NOT EXISTS dm_messages (
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

CREATE TABLE IF NOT EXISTS post_attachments (
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
  CONSTRAINT fk_post_attachments_post FOREIGN KEY (post_id) REFERENCES posts(post_id)
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT chk_post_attachments_file_size CHECK (file_size >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
