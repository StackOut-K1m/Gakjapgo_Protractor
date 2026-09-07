-- 수동 운영 마이그레이션: protractor DB에 한 번만 적용한다.
USE protractor;

-- 현재 공용 태그 사전에서 '자기계발'은 study_tag_id=8이다.
ALTER TABLE study_rooms
  ADD COLUMN study_tag_id BIGINT NOT NULL DEFAULT 8 AFTER host_member_id,
  ADD COLUMN thumbnail_image_url VARCHAR(1000) NULL AFTER description,
  ADD KEY idx_study_rooms_study_tag_id (study_tag_id),
  ADD CONSTRAINT fk_study_rooms_study_tag
    FOREIGN KEY (study_tag_id) REFERENCES study_tags(study_tag_id)
    ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE member_preferences
  ADD COLUMN goal_minutes INT NOT NULL DEFAULT 60 AFTER goal_text,
  ADD CONSTRAINT chk_member_preferences_goal_minutes CHECK (goal_minutes > 0);

-- 방당 단일 카테고리로 전환한다. 기존 연결 데이터는 0건임을 확인했다.
DROP TABLE study_room_tags;
