-- SEA-IT-SOLVED Phase 3A: camera calibration and lesson capture metadata
-- Idempotent: safe to run more than once in pgAdmin Query Tool.

BEGIN;

CREATE TABLE IF NOT EXISTS hardware_settings (
  instructor_id     UUID         PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  hardware_mode     VARCHAR(20)  NOT NULL DEFAULT 'SIMULATED'
                                  CHECK (hardware_mode IN ('SIMULATED', 'BROWSER')),
  camera_source_key VARCHAR(255) NULL,
  created_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS camera_calibrations (
  id             UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  instructor_id  UUID         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  source_key     VARCHAR(255) NOT NULL,
  hardware_mode  VARCHAR(20)  NOT NULL CHECK (hardware_mode IN ('SIMULATED', 'BROWSER')),
  points         JSONB        NOT NULL CHECK (jsonb_typeof(points) = 'object'),
  source_width   INTEGER      NOT NULL CHECK (source_width > 0),
  source_height  INTEGER      NOT NULL CHECK (source_height > 0),
  is_active      BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS camera_calibrations_instructor_source_unique
  ON camera_calibrations (instructor_id, source_key);
CREATE INDEX IF NOT EXISTS camera_calibrations_instructor_idx
  ON camera_calibrations (instructor_id);

CREATE TABLE IF NOT EXISTS lesson_captures (
  id                       UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id                UUID         NOT NULL REFERENCES lesson_sessions(id) ON DELETE CASCADE,
  section_id               UUID         NOT NULL REFERENCES sections(id) ON DELETE RESTRICT,
  instructor_id            UUID         NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  calibration_id           UUID         NULL REFERENCES camera_calibrations(id) ON DELETE SET NULL,
  storage_provider         VARCHAR(30)  NOT NULL DEFAULT 'LOCAL',
  original_storage_key     TEXT         NOT NULL,
  corrected_storage_key    TEXT         NULL,
  mime_type                VARCHAR(50)  NOT NULL,
  original_file_size       INTEGER      NOT NULL CHECK (original_file_size > 0),
  corrected_file_size      INTEGER      NULL CHECK (corrected_file_size IS NULL OR corrected_file_size > 0),
  original_width           INTEGER      NOT NULL CHECK (original_width > 0),
  original_height          INTEGER      NOT NULL CHECK (original_height > 0),
  corrected_width          INTEGER      NULL CHECK (corrected_width IS NULL OR corrected_width > 0),
  corrected_height         INTEGER      NULL CHECK (corrected_height IS NULL OR corrected_height > 0),
  captured_at              TIMESTAMPTZ  NOT NULL,
  created_at               TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS lesson_captures_lesson_time_idx
  ON lesson_captures (lesson_id, captured_at DESC);
CREATE INDEX IF NOT EXISTS lesson_captures_instructor_idx
  ON lesson_captures (instructor_id, created_at DESC);

COMMIT;
