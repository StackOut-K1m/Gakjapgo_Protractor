-- Existing protractor DB migration for daily study records (MySQL 8).
-- Fresh databases are created directly from backend/src/main/resources/schema.sql.
-- Backfill policy: DATE(joined_at), falling back to DATE(created_at).

USE protractor;

-- Add study_date only when it is absent, then backfill existing records.
SET @has_study_date := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'study_records'
    AND column_name = 'study_date'
);
SET @sql := IF(
  @has_study_date = 0,
  'ALTER TABLE study_records ADD COLUMN study_date DATE NULL AFTER member_id',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

UPDATE study_records
SET study_date = COALESCE(DATE(joined_at), DATE(created_at))
WHERE study_date IS NULL;

ALTER TABLE study_records
  MODIFY COLUMN study_date DATE NOT NULL;

-- Replace the legacy room/member uniqueness with a daily record uniqueness rule.
SET @has_legacy_unique := (
  SELECT COUNT(*)
  FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'study_records'
    AND index_name = 'uk_study_records_room_member'
);
SET @sql := IF(
  @has_legacy_unique > 0,
  'ALTER TABLE study_records DROP INDEX uk_study_records_room_member',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @has_daily_unique := (
  SELECT COUNT(*)
  FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'study_records'
    AND index_name = 'uk_study_records_room_member_date'
);
SET @sql := IF(
  @has_daily_unique = 0,
  'ALTER TABLE study_records ADD UNIQUE KEY uk_study_records_room_member_date (study_room_id, member_id, study_date)',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Add each lookup index only when it is absent.
SET @has_member_study_date_index := (
  SELECT COUNT(*) FROM information_schema.statistics
  WHERE table_schema = DATABASE() AND table_name = 'study_records'
    AND index_name = 'idx_study_records_member_study_date'
);
SET @sql := IF(@has_member_study_date_index = 0,
  'ALTER TABLE study_records ADD KEY idx_study_records_member_study_date (member_id, study_date)',
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @has_left_at_member_index := (
  SELECT COUNT(*) FROM information_schema.statistics
  WHERE table_schema = DATABASE() AND table_name = 'study_records'
    AND index_name = 'idx_study_records_left_at_member_id'
);
SET @sql := IF(@has_left_at_member_index = 0,
  'ALTER TABLE study_records ADD KEY idx_study_records_left_at_member_id (left_at, member_id)',
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @has_room_left_at_index := (
  SELECT COUNT(*) FROM information_schema.statistics
  WHERE table_schema = DATABASE() AND table_name = 'study_records'
    AND index_name = 'idx_study_records_room_left_at'
);
SET @sql := IF(@has_room_left_at_index = 0,
  'ALTER TABLE study_records ADD KEY idx_study_records_room_left_at (study_room_id, left_at)',
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @has_room_member_active_index := (
  SELECT COUNT(*) FROM information_schema.statistics
  WHERE table_schema = DATABASE() AND table_name = 'study_records'
    AND index_name = 'idx_study_records_room_member_active'
);
SET @sql := IF(@has_room_member_active_index = 0,
  'ALTER TABLE study_records ADD KEY idx_study_records_room_member_active (study_room_id, member_id, left_at, study_record_id)',
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
