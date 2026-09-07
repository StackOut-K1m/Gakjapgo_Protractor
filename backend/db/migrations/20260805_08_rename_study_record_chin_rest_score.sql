-- Existing protractor DB migration for the chin-rest score column (MySQL 8).
-- Existing values are preserved; only the column and CHECK constraint names change.

USE protractor;

-- Remove the legacy CHECK constraint only when the legacy column is still present.
SET @has_legacy_column := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'study_records'
    AND column_name = 'shoulder_score'
);
SET @has_chin_rest_column := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'study_records'
    AND column_name = 'chin_rest_score'
);
SET @has_legacy_check := (
  SELECT COUNT(*)
  FROM information_schema.table_constraints
  WHERE constraint_schema = DATABASE()
    AND table_name = 'study_records'
    AND constraint_name = 'chk_study_records_shoulder_score'
    AND constraint_type = 'CHECK'
);

SET @sql := IF(
  @has_legacy_column > 0 AND @has_chin_rest_column = 0 AND @has_legacy_check > 0,
  'ALTER TABLE study_records DROP CHECK chk_study_records_shoulder_score',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql := IF(
  @has_legacy_column > 0 AND @has_chin_rest_column = 0,
  'ALTER TABLE study_records CHANGE COLUMN shoulder_score chin_rest_score DECIMAL(5,2) NULL',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Recreate the score-range CHECK constraint under its semantic name when absent.
SET @has_chin_rest_check := (
  SELECT COUNT(*)
  FROM information_schema.table_constraints
  WHERE constraint_schema = DATABASE()
    AND table_name = 'study_records'
    AND constraint_name = 'chk_study_records_chin_rest_score'
    AND constraint_type = 'CHECK'
);
SET @sql := IF(
  @has_chin_rest_check = 0,
  'ALTER TABLE study_records ADD CONSTRAINT chk_study_records_chin_rest_score CHECK (chin_rest_score IS NULL OR chin_rest_score BETWEEN 0 AND 100)',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
