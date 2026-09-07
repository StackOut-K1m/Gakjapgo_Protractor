-- 수동 운영 마이그레이션: protractor DB에 한 번만 적용한다.
-- Flyway/Liquibase가 연결되어 있지 않으므로 애플리케이션이 자동 실행하지 않는다.
-- 적용 전 백업 및 SHOW CREATE TABLE study_rooms 확인이 필요하다.

USE protractor;
SET NAMES utf8mb4;

-- 초기화 스키마에는 있으나 기존 운영 DB에 없던 온보딩 목적 테이블과 공용 태그 시드를 동기화한다.
CREATE TABLE IF NOT EXISTS member_purposes (
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

INSERT IGNORE INTO study_tags (name) VALUES
  ('수능'), ('공무원'), ('취업'), ('자격증'), ('어학'), ('IT·개발'), ('독서'), ('자기계발');

-- 방의 실제 분류·추천 태그는 study_room_tags를 계속 사용한다.
-- hash_tags는 검색·추천 대상이 아닌 자유 입력 문자열이다.
ALTER TABLE study_rooms
  ADD COLUMN hash_tags VARCHAR(500) NULL AFTER stretching_enabled,
  ADD COLUMN is_locked BOOLEAN NOT NULL DEFAULT FALSE AFTER hash_tags,
  ADD COLUMN password VARCHAR(255) NULL AFTER is_locked,
  ADD COLUMN rules TEXT NULL AFTER password,
  ADD COLUMN description TEXT NULL AFTER rules;
