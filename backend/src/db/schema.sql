-- ─────────────────────────────────────────────────────────────────────────
-- SEA-IT-SOLVED  Phase 1 + Phase 2 + Phase 3A + Phase 3B + Phase 3C  Full Database Schema
-- Run:  psql -U postgres -d sea_it_solved -f src/db/schema.sql
-- Idempotent — safe to run against a fresh or existing database.
-- Existing databases should run each phase migration in order, including
-- migration_phase3a_camera.sql, migration_phase3b_audio.sql, and
-- migration_phase3b_smart_capture.sql, and migration_phase3c_lighting.sql.
-- ─────────────────────────────────────────────────────────────────────────

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ── ENUM types ──────────────────────────────────────────────────────────────
DO $$ BEGIN CREATE TYPE user_role     AS ENUM ('ADMIN', 'INSTRUCTOR', 'STUDENT');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE user_status   AS ENUM ('ACTIVE', 'PENDING', 'REJECTED', 'SUSPENDED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE enroll_status AS ENUM ('PENDING', 'APPROVED', 'REJECTED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE lesson_status AS ENUM ('CREATED', 'ACTIVE', 'PAUSED', 'COMPLETED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── users ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  first_name      VARCHAR(80)  NOT NULL,
  last_name       VARCHAR(80)  NOT NULL,
  email           VARCHAR(255) NOT NULL,
  student_number  VARCHAR(30)  NULL,
  password_hash   TEXT         NOT NULL,
  auth_version    INTEGER      NOT NULL DEFAULT 0 CHECK (auth_version >= 0),
  role            user_role    NOT NULL,
  status          user_status  NOT NULL DEFAULT 'ACTIVE',
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS users_email_unique          ON users (LOWER(email));
CREATE INDEX        IF NOT EXISTS users_role_idx              ON users (role);
CREATE INDEX        IF NOT EXISTS users_status_idx            ON users (status);
CREATE UNIQUE INDEX IF NOT EXISTS users_student_number_unique ON users (student_number) WHERE student_number IS NOT NULL;

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash CHAR(64)    NOT NULL CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  expires_at TIMESTAMPTZ NOT NULL,
  used_at    TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS password_reset_tokens_hash_unique ON password_reset_tokens(token_hash);
CREATE INDEX IF NOT EXISTS password_reset_tokens_user_active_idx ON password_reset_tokens(user_id,expires_at DESC) WHERE used_at IS NULL;
CREATE INDEX IF NOT EXISTS password_reset_tokens_expiry_idx ON password_reset_tokens(expires_at) WHERE used_at IS NULL;

-- ── subjects ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS subjects (
  id         UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  code       VARCHAR(20)  NOT NULL,
  name       VARCHAR(255) NOT NULL,
  created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS subjects_code_unique ON subjects (UPPER(code));

INSERT INTO subjects (code, name) VALUES
  ('MATH101','Mathematics 101'), ('ENGEC','Engineering Economy'),
  ('CALC1','Calculus 1'), ('CALC2','Calculus 2'),
  ('DIFFEQ','Differential Equations'), ('LINALG','Linear Algebra'),
  ('DISCRETE','Discrete Mathematics'), ('STATS','Probability and Statistics')
ON CONFLICT DO NOTHING;

-- ── instructor teaching folders (organization only) ────────────────────────
CREATE TABLE IF NOT EXISTS teaching_folders (
  id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  instructor_id UUID         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name          VARCHAR(120) NOT NULL CHECK (LENGTH(TRIM(name)) > 0),
  display_order INTEGER      NOT NULL DEFAULT 0 CHECK (display_order >= 0),
  archived_at   TIMESTAMPTZ  NULL,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS teaching_folders_instructor_name_unique
  ON teaching_folders (instructor_id, LOWER(TRIM(name)));
CREATE INDEX IF NOT EXISTS teaching_folders_instructor_order_idx
  ON teaching_folders (instructor_id, archived_at, display_order, created_at);

-- ── sections ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sections (
  id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_id    UUID         NOT NULL REFERENCES subjects(id) ON DELETE RESTRICT,
  instructor_id UUID         NOT NULL REFERENCES users(id)    ON DELETE RESTRICT,
  teaching_folder_id UUID      NULL REFERENCES teaching_folders(id) ON DELETE SET NULL,
  section_name  VARCHAR(120) NOT NULL,
  join_code     VARCHAR(12)  NOT NULL,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS sections_join_code_unique ON sections (join_code);
CREATE INDEX        IF NOT EXISTS sections_instructor_idx   ON sections (instructor_id);
CREATE INDEX        IF NOT EXISTS sections_subject_idx      ON sections (subject_id);
CREATE INDEX        IF NOT EXISTS sections_teaching_folder_idx ON sections (teaching_folder_id);
CREATE UNIQUE INDEX IF NOT EXISTS sections_instructor_subject_name_unique
  ON sections (instructor_id, subject_id, LOWER(section_name));

-- ── enrollments ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS enrollments (
  id           UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  section_id   UUID          NOT NULL REFERENCES sections(id) ON DELETE CASCADE,
  student_id   UUID          NOT NULL REFERENCES users(id)    ON DELETE CASCADE,
  status       enroll_status NOT NULL DEFAULT 'PENDING',
  requested_at TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  approved_at  TIMESTAMPTZ   NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS enrollments_student_section_unique  ON enrollments (section_id, student_id);
CREATE INDEX        IF NOT EXISTS enrollments_section_status_idx      ON enrollments (section_id, status);
CREATE INDEX        IF NOT EXISTS enrollments_student_idx             ON enrollments (student_id);

-- ── lesson_sessions ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS lesson_sessions (
  id            UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  section_id    UUID          NOT NULL REFERENCES sections(id) ON DELETE RESTRICT,
  instructor_id UUID          NOT NULL REFERENCES users(id)    ON DELETE RESTRICT,
  title         VARCHAR(200)  NOT NULL,
  topic         VARCHAR(500)  NULL,
  status        lesson_status NOT NULL DEFAULT 'CREATED',
  started_at    TIMESTAMPTZ   NULL,
  ended_at      TIMESTAMPTZ   NULL,
  created_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX        IF NOT EXISTS lessons_section_idx    ON lesson_sessions (section_id);
CREATE INDEX        IF NOT EXISTS lessons_instructor_idx ON lesson_sessions (instructor_id);
CREATE INDEX        IF NOT EXISTS lessons_status_idx     ON lesson_sessions (status);

-- At most one ACTIVE or PAUSED lesson per section at any time
CREATE UNIQUE INDEX IF NOT EXISTS lesson_sessions_one_current_per_section
  ON lesson_sessions (section_id)
  WHERE status IN ('ACTIVE', 'PAUSED');

-- ── lesson_pause_events ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS lesson_pause_events (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id   UUID        NOT NULL REFERENCES lesson_sessions(id) ON DELETE CASCADE,
  paused_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resumed_at  TIMESTAMPTZ NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS pause_events_lesson_idx ON lesson_pause_events (lesson_id);
CREATE INDEX IF NOT EXISTS pause_events_open_idx   ON lesson_pause_events (lesson_id) WHERE resumed_at IS NULL;

-- ── Phase 3A: instructor hardware settings ───────────────────────────────────
CREATE TABLE IF NOT EXISTS hardware_settings (
  instructor_id    UUID         PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  hardware_mode    VARCHAR(20)  NOT NULL DEFAULT 'SIMULATED'
                                 CHECK (hardware_mode IN ('SIMULATED', 'BROWSER')),
  camera_source_key VARCHAR(255) NULL,
  microphone_mode   VARCHAR(20)  NOT NULL DEFAULT 'SIMULATED'
                                CHECK (microphone_mode IN ('SIMULATED', 'BROWSER')),
  microphone_source_key VARCHAR(255) NULL,
  microphone_noise_suppression BOOLEAN NOT NULL DEFAULT TRUE,
  auto_capture_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  auto_capture_mode VARCHAR(20) NOT NULL DEFAULT 'SMART_AUTO'
                    CHECK (auto_capture_mode IN ('MANUAL', 'SMART_AUTO', 'INTERVAL')),
  board_fill_sensitivity VARCHAR(10) NOT NULL DEFAULT 'MEDIUM'
                         CHECK (board_fill_sensitivity IN ('LOW', 'MEDIUM', 'HIGH')),
  minimum_content_change_percent INTEGER NOT NULL DEFAULT 20
                                 CHECK (minimum_content_change_percent BETWEEN 1 AND 100),
  stability_seconds INTEGER NOT NULL DEFAULT 3 CHECK (stability_seconds BETWEEN 1 AND 30),
  cooldown_seconds INTEGER NOT NULL DEFAULT 30 CHECK (cooldown_seconds BETWEEN 5 AND 3600),
  interval_minutes INTEGER NOT NULL DEFAULT 5 CHECK (interval_minutes BETWEEN 1 AND 240),
  capture_while_paused BOOLEAN NOT NULL DEFAULT FALSE,
  lighting_hardware_mode VARCHAR(20) NOT NULL DEFAULT 'SIMULATED'
                         CHECK (lighting_hardware_mode IN ('SIMULATED', 'RASPBERRY_PI')),
  lighting_mode VARCHAR(10) NOT NULL DEFAULT 'AUTO'
                CHECK (lighting_mode IN ('AUTO', 'ON', 'OFF')),
  lighting_threshold_percent INTEGER NOT NULL DEFAULT 30
                               CHECK (lighting_threshold_percent BETWEEN 0 AND 100),
  lighting_hysteresis_percent INTEGER NOT NULL DEFAULT 5
                                CHECK (lighting_hysteresis_percent BETWEEN 0 AND 50),
  lighting_brightness_percent INTEGER NOT NULL DEFAULT 80
                                CHECK (lighting_brightness_percent BETWEEN 0 AND 100),
  simulated_ambient_light_percent INTEGER NOT NULL DEFAULT 35
                                    CHECK (simulated_ambient_light_percent BETWEEN 0 AND 100),
  CONSTRAINT hardware_settings_lighting_threshold_band_check
    CHECK (lighting_threshold_percent + lighting_hysteresis_percent <= 100),
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ── Phase 3A: normalized four-point camera calibration ───────────────────────
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

-- ── Phase 3A: lesson-linked capture metadata ─────────────────────────────────
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

-- Independently corrected, ordered regions for multi-plane captures.
-- Existing captures without child rows continue to use lesson_captures.corrected_storage_key.
CREATE TABLE IF NOT EXISTS lesson_capture_planes (
  id                    UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  capture_id            UUID         NOT NULL REFERENCES lesson_captures(id) ON DELETE CASCADE,
  calibration_plane_id  VARCHAR(100) NOT NULL,
  label                 VARCHAR(80)  NOT NULL,
  plane_order           INTEGER      NOT NULL CHECK (plane_order > 0),
  corners               JSONB        NOT NULL CHECK (jsonb_typeof(corners) = 'object'),
  storage_provider      VARCHAR(30)  NOT NULL DEFAULT 'LOCAL',
  storage_key           TEXT         NOT NULL,
  mime_type             VARCHAR(50)  NOT NULL,
  file_size             INTEGER      NOT NULL CHECK (file_size > 0),
  width                 INTEGER      NOT NULL CHECK (width > 0),
  height                INTEGER      NOT NULL CHECK (height > 0),
  created_at            TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS lesson_capture_planes_capture_order_unique
  ON lesson_capture_planes (capture_id, plane_order);
CREATE UNIQUE INDEX IF NOT EXISTS lesson_capture_planes_capture_plane_unique
  ON lesson_capture_planes (capture_id, calibration_plane_id);
CREATE INDEX IF NOT EXISTS lesson_capture_planes_capture_idx
  ON lesson_capture_planes (capture_id, plane_order);

CREATE TABLE IF NOT EXISTS capture_recognitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  capture_id UUID NOT NULL REFERENCES lesson_captures(id) ON DELETE CASCADE,
  lesson_id UUID NOT NULL REFERENCES lesson_sessions(id) ON DELETE CASCADE,
  section_id UUID NOT NULL REFERENCES sections(id) ON DELETE RESTRICT,
  instructor_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  status VARCHAR(30) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','PROCESSING','REVIEW_REQUIRED','FAILED','APPROVED')),
  source_variant VARCHAR(20) NULL CHECK (source_variant IS NULL OR source_variant IN ('CORRECTED','ORIGINAL')),
  source_sha256 CHAR(64) NULL CHECK (source_sha256 IS NULL OR source_sha256 ~ '^[0-9a-f]{64}$'),
  source_width INTEGER NULL CHECK (source_width IS NULL OR source_width > 0),
  source_height INTEGER NULL CHECK (source_height IS NULL OR source_height > 0),
  plain_text TEXT NULL,
  math_expressions JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(math_expressions) = 'array'),
  structured_result JSONB NULL CHECK (structured_result IS NULL OR jsonb_typeof(structured_result) = 'object'),
  provider VARCHAR(50) NULL,
  provider_version VARCHAR(100) NULL,
  schema_version INTEGER NOT NULL DEFAULT 1 CHECK (schema_version > 0),
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  result_attempt_number INTEGER NULL CHECK (result_attempt_number IS NULL OR result_attempt_number > 0),
  last_failure_code VARCHAR(80) NULL,
  last_failure_message TEXT NULL,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS capture_recognitions_capture_unique ON capture_recognitions (capture_id);
CREATE INDEX IF NOT EXISTS capture_recognitions_lesson_status_idx ON capture_recognitions (lesson_id, status);
CREATE INDEX IF NOT EXISTS capture_recognitions_instructor_updated_idx ON capture_recognitions (instructor_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS capture_recognition_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recognition_id UUID NOT NULL REFERENCES capture_recognitions(id) ON DELETE CASCADE,
  attempt_number INTEGER NOT NULL CHECK (attempt_number > 0),
  request_kind VARCHAR(20) NOT NULL CHECK (request_kind IN ('INITIAL','AUTO_RETRY','REPROCESS')),
  status VARCHAR(20) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','PROCESSING','SUCCEEDED','FAILED')),
  provider VARCHAR(50) NOT NULL,
  provider_version VARCHAR(100) NULL,
  normalized_result JSONB NULL CHECK (normalized_result IS NULL OR jsonb_typeof(normalized_result) = 'object'),
  sanitized_provider_output JSONB NULL CHECK (sanitized_provider_output IS NULL OR jsonb_typeof(sanitized_provider_output) = 'object'),
  failure_code VARCHAR(80) NULL,
  failure_message TEXT NULL,
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  worker_id VARCHAR(120) NULL,
  locked_at TIMESTAMPTZ NULL,
  started_at TIMESTAMPTZ NULL,
  completed_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT capture_recognition_attempts_number_unique UNIQUE (recognition_id, attempt_number)
);

CREATE INDEX IF NOT EXISTS capture_recognition_attempts_queue_idx ON capture_recognition_attempts (next_attempt_at, created_at) WHERE status = 'PENDING';
CREATE INDEX IF NOT EXISTS capture_recognition_attempts_processing_idx ON capture_recognition_attempts (locked_at) WHERE status = 'PROCESSING';

-- Phase 3B: microphone settings and lesson audio recordings
CREATE TABLE IF NOT EXISTS lesson_audio_recordings (
  id               UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id        UUID         NOT NULL REFERENCES lesson_sessions(id) ON DELETE CASCADE,
  section_id       UUID         NOT NULL REFERENCES sections(id) ON DELETE RESTRICT,
  instructor_id    UUID         NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  source_key       VARCHAR(255) NOT NULL,
  hardware_mode    VARCHAR(20)  NOT NULL CHECK (hardware_mode IN ('SIMULATED', 'BROWSER')),
  storage_provider VARCHAR(30)  NOT NULL DEFAULT 'LOCAL',
  storage_key      TEXT         NOT NULL,
  mime_type        VARCHAR(100) NOT NULL,
  file_size        BIGINT       NOT NULL CHECK (file_size > 0),
  duration_ms      BIGINT       NOT NULL CHECK (duration_ms >= 0),
  started_at       TIMESTAMPTZ  NOT NULL,
  completed_at     TIMESTAMPTZ  NOT NULL,
  recorded_at      TIMESTAMPTZ  NOT NULL,
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  CONSTRAINT lesson_audio_recordings_time_check CHECK (completed_at >= started_at)
);

CREATE UNIQUE INDEX IF NOT EXISTS lesson_audio_recordings_lesson_unique
  ON lesson_audio_recordings (lesson_id);
CREATE INDEX IF NOT EXISTS lesson_audio_recordings_instructor_idx
  ON lesson_audio_recordings (instructor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS lesson_audio_recordings_section_idx
  ON lesson_audio_recordings (section_id, recorded_at DESC);

CREATE TABLE IF NOT EXISTS lesson_audio_recording_pauses (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  recording_id  UUID        NOT NULL REFERENCES lesson_audio_recordings(id) ON DELETE CASCADE,
  paused_at     TIMESTAMPTZ NOT NULL,
  resumed_at    TIMESTAMPTZ NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT lesson_audio_recording_pauses_time_check CHECK (resumed_at >= paused_at)
);

CREATE INDEX IF NOT EXISTS lesson_audio_recording_pauses_recording_time_idx
  ON lesson_audio_recording_pauses (recording_id, paused_at ASC);

-- Phase 4B: protected lesson audio transcription and shared provider throttling
CREATE TABLE IF NOT EXISTS provider_request_throttles (
  provider_key VARCHAR(80) PRIMARY KEY,
  next_request_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS lesson_transcriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recording_id UUID NOT NULL REFERENCES lesson_audio_recordings(id) ON DELETE CASCADE,
  lesson_id UUID NOT NULL REFERENCES lesson_sessions(id) ON DELETE CASCADE,
  section_id UUID NOT NULL REFERENCES sections(id) ON DELETE RESTRICT,
  instructor_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  status VARCHAR(30) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','PROCESSING','REVIEW_REQUIRED','FAILED','APPROVED')),
  language VARCHAR(64) NULL,
  transcript_text TEXT NULL,
  segments JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(segments) = 'array'),
  structured_result JSONB NULL CHECK (structured_result IS NULL OR jsonb_typeof(structured_result) = 'object'),
  provider VARCHAR(50) NULL,
  provider_version VARCHAR(100) NULL,
  source_sha256 CHAR(64) NULL CHECK (source_sha256 IS NULL OR source_sha256 ~ '^[0-9a-f]{64}$'),
  source_mime_type VARCHAR(100) NULL,
  source_duration_ms BIGINT NULL CHECK (source_duration_ms IS NULL OR source_duration_ms >= 0),
  timing_mapping_version INTEGER NOT NULL DEFAULT 1 CHECK (timing_mapping_version > 0),
  schema_version INTEGER NOT NULL DEFAULT 1 CHECK (schema_version > 0),
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  result_attempt_number INTEGER NULL CHECK (result_attempt_number IS NULL OR result_attempt_number > 0),
  last_failure_code VARCHAR(80) NULL,
  last_failure_message TEXT NULL,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS lesson_transcriptions_recording_unique ON lesson_transcriptions (recording_id);
CREATE INDEX IF NOT EXISTS lesson_transcriptions_lesson_status_idx ON lesson_transcriptions (lesson_id, status);
CREATE INDEX IF NOT EXISTS lesson_transcriptions_instructor_updated_idx ON lesson_transcriptions (instructor_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS lesson_transcription_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transcription_id UUID NOT NULL REFERENCES lesson_transcriptions(id) ON DELETE CASCADE,
  attempt_number INTEGER NOT NULL CHECK (attempt_number > 0),
  request_kind VARCHAR(20) NOT NULL CHECK (request_kind IN ('INITIAL','AUTO_RETRY','REPROCESS')),
  status VARCHAR(20) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','PROCESSING','SUCCEEDED','FAILED')),
  provider VARCHAR(50) NOT NULL,
  provider_version VARCHAR(100) NULL,
  normalized_result JSONB NULL CHECK (normalized_result IS NULL OR jsonb_typeof(normalized_result) = 'object'),
  sanitized_provider_output JSONB NULL CHECK (sanitized_provider_output IS NULL OR jsonb_typeof(sanitized_provider_output) = 'object'),
  failure_code VARCHAR(80) NULL,
  failure_message TEXT NULL,
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  worker_id VARCHAR(120) NULL,
  locked_at TIMESTAMPTZ NULL,
  started_at TIMESTAMPTZ NULL,
  completed_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT lesson_transcription_attempts_number_unique UNIQUE (transcription_id, attempt_number)
);

CREATE INDEX IF NOT EXISTS lesson_transcription_attempts_queue_idx ON lesson_transcription_attempts (next_attempt_at, created_at) WHERE status = 'PENDING';
CREATE INDEX IF NOT EXISTS lesson_transcription_attempts_processing_idx ON lesson_transcription_attempts (locked_at) WHERE status = 'PROCESSING';

-- Ordered lesson-level whiteboard compilation
CREATE TABLE IF NOT EXISTS lesson_recognitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id UUID NOT NULL REFERENCES lesson_sessions(id) ON DELETE CASCADE,
  section_id UUID NOT NULL REFERENCES sections(id) ON DELETE RESTRICT,
  instructor_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  status VARCHAR(30) NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING','PROCESSING','REVIEW_REQUIRED','FAILED','APPROVED')),
  capture_count INTEGER NOT NULL DEFAULT 0 CHECK (capture_count >= 0),
  capture_set_sha256 CHAR(64) NULL CHECK (capture_set_sha256 IS NULL OR capture_set_sha256 ~ '^[0-9a-f]{64}$'),
  compiled_text TEXT NULL,
  pages JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(pages) = 'array'),
  structured_result JSONB NULL CHECK (structured_result IS NULL OR jsonb_typeof(structured_result) = 'object'),
  provider VARCHAR(50) NULL,
  provider_version VARCHAR(100) NULL,
  schema_version INTEGER NOT NULL DEFAULT 1 CHECK (schema_version > 0),
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  result_attempt_number INTEGER NULL CHECK (result_attempt_number IS NULL OR result_attempt_number > 0),
  last_failure_code VARCHAR(80) NULL,
  last_failure_message TEXT NULL,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS lesson_recognitions_lesson_unique ON lesson_recognitions (lesson_id);
CREATE INDEX IF NOT EXISTS lesson_recognitions_instructor_updated_idx ON lesson_recognitions (instructor_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS lesson_recognition_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_recognition_id UUID NOT NULL REFERENCES lesson_recognitions(id) ON DELETE CASCADE,
  attempt_number INTEGER NOT NULL CHECK (attempt_number > 0),
  request_kind VARCHAR(20) NOT NULL CHECK (request_kind IN ('INITIAL','AUTO_RETRY','REPROCESS')),
  status VARCHAR(20) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','PROCESSING','SUCCEEDED','FAILED')),
  provider VARCHAR(50) NOT NULL,
  provider_version VARCHAR(100) NULL,
  normalized_result JSONB NULL CHECK (normalized_result IS NULL OR jsonb_typeof(normalized_result) = 'object'),
  sanitized_provider_output JSONB NULL CHECK (sanitized_provider_output IS NULL OR jsonb_typeof(sanitized_provider_output) = 'object'),
  failure_code VARCHAR(80) NULL,
  failure_message TEXT NULL,
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  worker_id VARCHAR(120) NULL,
  locked_at TIMESTAMPTZ NULL,
  started_at TIMESTAMPTZ NULL,
  completed_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT lesson_recognition_attempts_number_unique UNIQUE (lesson_recognition_id, attempt_number)
);

CREATE INDEX IF NOT EXISTS lesson_recognition_attempts_queue_idx
  ON lesson_recognition_attempts (next_attempt_at, created_at) WHERE status = 'PENDING';
CREATE INDEX IF NOT EXISTS lesson_recognition_attempts_processing_idx
  ON lesson_recognition_attempts (locked_at) WHERE status = 'PROCESSING';

-- Phase 4C, Phase 4D, and Phase 5 lesson intelligence pipeline
-- Phase 4C/4D: protected instructor-supplied lesson sources and reviewable context.
CREATE TABLE IF NOT EXISTS lesson_materials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id UUID NOT NULL REFERENCES lesson_sessions(id) ON DELETE CASCADE,
  section_id UUID NOT NULL REFERENCES sections(id) ON DELETE RESTRICT,
  instructor_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  material_type VARCHAR(10) NOT NULL CHECK (material_type IN ('IMAGE','PDF')),
  original_filename VARCHAR(255) NOT NULL,
  storage_provider VARCHAR(30) NOT NULL DEFAULT 'LOCAL',
  storage_key TEXT NOT NULL,
  mime_type VARCHAR(100) NOT NULL,
  file_size BIGINT NOT NULL CHECK (file_size > 0),
  page_count INTEGER NULL CHECK (page_count IS NULL OR page_count > 0),
  status VARCHAR(30) NOT NULL DEFAULT 'UPLOADED'
    CHECK (status IN ('UPLOADED','PROCESSING','REVIEW_REQUIRED','APPROVED','FAILED')),
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  last_failure_code VARCHAR(80) NULL,
  last_failure_message TEXT NULL,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS lesson_materials_lesson_idx ON lesson_materials (lesson_id, uploaded_at);
CREATE INDEX IF NOT EXISTS lesson_materials_instructor_idx ON lesson_materials (instructor_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS lesson_material_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  material_id UUID NOT NULL REFERENCES lesson_materials(id) ON DELETE CASCADE,
  provider VARCHAR(50) NULL,
  provider_version VARCHAR(100) NULL,
  schema_version INTEGER NOT NULL DEFAULT 1 CHECK (schema_version > 0),
  plain_text TEXT NOT NULL DEFAULT '',
  math_expressions JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(math_expressions) = 'array'),
  pages JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(pages) = 'array'),
  raw_extraction JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(raw_extraction) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS lesson_material_results_material_unique ON lesson_material_results (material_id);

CREATE TABLE IF NOT EXISTS lesson_material_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  material_id UUID NOT NULL REFERENCES lesson_materials(id) ON DELETE CASCADE,
  attempt_number INTEGER NOT NULL CHECK (attempt_number > 0),
  request_kind VARCHAR(20) NOT NULL CHECK (request_kind IN ('INITIAL','AUTO_RETRY','REPROCESS')),
  status VARCHAR(20) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','PROCESSING','SUCCEEDED','FAILED')),
  provider VARCHAR(50) NOT NULL,
  provider_version VARCHAR(100) NULL,
  normalized_result JSONB NULL CHECK (normalized_result IS NULL OR jsonb_typeof(normalized_result) = 'object'),
  sanitized_provider_output JSONB NULL CHECK (sanitized_provider_output IS NULL OR jsonb_typeof(sanitized_provider_output) = 'object'),
  failure_code VARCHAR(80) NULL,
  failure_message TEXT NULL,
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  worker_id VARCHAR(120) NULL,
  locked_at TIMESTAMPTZ NULL,
  started_at TIMESTAMPTZ NULL,
  completed_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT lesson_material_attempts_number_unique UNIQUE (material_id, attempt_number)
);

CREATE INDEX IF NOT EXISTS lesson_material_attempts_queue_idx
  ON lesson_material_attempts (next_attempt_at, created_at) WHERE status = 'PENDING';
CREATE INDEX IF NOT EXISTS lesson_material_attempts_processing_idx
  ON lesson_material_attempts (locked_at) WHERE status = 'PROCESSING';

CREATE TABLE IF NOT EXISTS lesson_context_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id UUID NOT NULL REFERENCES lesson_sessions(id) ON DELETE CASCADE,
  section_id UUID NOT NULL REFERENCES sections(id) ON DELETE RESTRICT,
  instructor_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  version_number INTEGER NOT NULL CHECK (version_number > 0),
  status VARCHAR(20) NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','APPROVED','ARCHIVED')),
  approved_at TIMESTAMPTZ NULL,
  approved_by UUID NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT lesson_context_versions_number_unique UNIQUE (lesson_id, version_number)
);

CREATE UNIQUE INDEX IF NOT EXISTS lesson_context_versions_one_draft
  ON lesson_context_versions (lesson_id) WHERE status = 'DRAFT';
CREATE UNIQUE INDEX IF NOT EXISTS lesson_context_versions_one_approved
  ON lesson_context_versions (lesson_id) WHERE status = 'APPROVED';

CREATE TABLE IF NOT EXISTS lesson_context_chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  context_version_id UUID NOT NULL REFERENCES lesson_context_versions(id) ON DELETE CASCADE,
  lesson_id UUID NOT NULL REFERENCES lesson_sessions(id) ON DELETE CASCADE,
  chunk_type VARCHAR(30) NOT NULL CHECK (chunk_type IN ('WHITEBOARD','SPEECH','UPLOADED_IMAGE','PDF')),
  chunk_order INTEGER NOT NULL CHECK (chunk_order >= 0),
  lesson_offset_ms BIGINT NULL CHECK (lesson_offset_ms IS NULL OR lesson_offset_ms >= 0),
  source JSONB NOT NULL CHECK (jsonb_typeof(source) = 'object'),
  raw_text TEXT NOT NULL DEFAULT '',
  raw_math JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(raw_math) = 'array'),
  reviewed_text TEXT NOT NULL DEFAULT '',
  reviewed_math JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(reviewed_math) = 'array'),
  uncertain BOOLEAN NOT NULL DEFAULT FALSE,
  removed BOOLEAN NOT NULL DEFAULT FALSE,
  edited BOOLEAN NOT NULL DEFAULT FALSE,
  content_type VARCHAR(20) NOT NULL DEFAULT 'OTHER' CHECK (content_type IN ('EXPLANATION','EXAMPLE','PROBLEM','FORMULA','DEFINITION','OTHER')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS lesson_context_chunks_version_order_idx
  ON lesson_context_chunks (context_version_id, chunk_order);
CREATE INDEX IF NOT EXISTS lesson_context_chunks_approved_content_type_idx
  ON lesson_context_chunks (lesson_id, content_type) WHERE removed = FALSE;

-- Phase 5: generated study material and instructor-reviewed quizzes.
CREATE TABLE IF NOT EXISTS generated_lesson_materials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id UUID NOT NULL REFERENCES lesson_sessions(id) ON DELETE CASCADE,
  context_version_id UUID NOT NULL REFERENCES lesson_context_versions(id) ON DELETE RESTRICT,
  instructor_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  material_type VARCHAR(30) NOT NULL CHECK (material_type IN ('SUMMARY','NOTES','EXPLANATION','KEY_FORMULAS','WORKED_EXAMPLE','COMMON_MISTAKES')),
  title VARCHAR(255) NOT NULL,
  content JSONB NOT NULL CHECK (jsonb_typeof(content) = 'object'),
  source_references JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(source_references) = 'array'),
  provider VARCHAR(50) NOT NULL,
  provider_version VARCHAR(100) NOT NULL,
  outdated BOOLEAN NOT NULL DEFAULT FALSE,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  removed BOOLEAN NOT NULL DEFAULT FALSE,
  display_order INTEGER NULL,
  published_snapshot JSONB NULL
    CHECK (published_snapshot IS NULL OR jsonb_typeof(published_snapshot) = 'object')
);

CREATE INDEX IF NOT EXISTS generated_lesson_materials_lesson_idx
  ON generated_lesson_materials (lesson_id, generated_at DESC);

CREATE TABLE IF NOT EXISTS lesson_quizzes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id UUID NOT NULL REFERENCES lesson_sessions(id) ON DELETE CASCADE,
  context_version_id UUID NOT NULL REFERENCES lesson_context_versions(id) ON DELETE RESTRICT,
  instructor_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  title VARCHAR(255) NOT NULL,
  instructions TEXT NOT NULL DEFAULT '',
  difficulty VARCHAR(10) NOT NULL DEFAULT 'MEDIUM' CHECK (difficulty IN ('EASY','MEDIUM','HARD')),
  status VARCHAR(20) NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','PUBLISHED','DISABLED')),
  provider VARCHAR(50) NOT NULL,
  provider_version VARCHAR(100) NOT NULL,
  outdated BOOLEAN NOT NULL DEFAULT FALSE,
  published_at TIMESTAMPTZ NULL,
  closed_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS lesson_quizzes_lesson_idx ON lesson_quizzes (lesson_id, created_at DESC);

CREATE TABLE IF NOT EXISTS lesson_quiz_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quiz_id UUID NOT NULL REFERENCES lesson_quizzes(id) ON DELETE CASCADE,
  question_order INTEGER NOT NULL CHECK (question_order > 0),
  question_type VARCHAR(30) NOT NULL CHECK (question_type IN ('MULTIPLE_CHOICE','TRUE_FALSE','SHORT_ANSWER')),
  topic VARCHAR(255) NULL,
  difficulty VARCHAR(10) NOT NULL CHECK (difficulty IN ('EASY','MEDIUM','HARD')),
  prompt TEXT NOT NULL,
  choices JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(choices) = 'array'),
  correct_answer TEXT NOT NULL,
  explanation TEXT NOT NULL DEFAULT '',
  source_references JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(source_references) = 'array'),
  manual_grading BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT lesson_quiz_questions_order_unique UNIQUE (quiz_id, question_order)
);

-- Phase 5 refinement: approved-context professor chat history.
CREATE TABLE IF NOT EXISTS lesson_chat_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id UUID NOT NULL REFERENCES lesson_sessions(id) ON DELETE CASCADE,
  context_version_id UUID NOT NULL REFERENCES lesson_context_versions(id) ON DELETE CASCADE,
  instructor_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT lesson_chat_sessions_context_unique
    UNIQUE (lesson_id, context_version_id, instructor_id)
);

CREATE INDEX IF NOT EXISTS lesson_chat_sessions_lesson_idx
  ON lesson_chat_sessions (lesson_id, instructor_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS lesson_chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES lesson_chat_sessions(id) ON DELETE CASCADE,
  lesson_id UUID NOT NULL REFERENCES lesson_sessions(id) ON DELETE CASCADE,
  instructor_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  role VARCHAR(12) NOT NULL CHECK (role IN ('USER','ASSISTANT')),
  content TEXT NOT NULL CHECK (length(trim(content)) > 0),
  source_references JSONB NOT NULL DEFAULT '[]'::jsonb
    CHECK (jsonb_typeof(source_references) = 'array'),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(metadata) = 'object'),
  message_type VARCHAR(20) NOT NULL DEFAULT 'ASK',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS lesson_chat_messages_session_idx
  ON lesson_chat_messages (session_id, created_at, id);





CREATE TABLE IF NOT EXISTS generated_material_edits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  generated_material_id UUID NOT NULL REFERENCES generated_lesson_materials(id) ON DELETE CASCADE,
  lesson_id UUID NOT NULL REFERENCES lesson_sessions(id) ON DELETE CASCADE,
  context_version_id UUID NOT NULL REFERENCES lesson_context_versions(id) ON DELETE CASCADE,
  instructor_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  edit_instruction TEXT NOT NULL,
  action VARCHAR(30) NOT NULL CHECK (action IN ('UPDATE_SECTION','ADD_SECTION','REMOVE_SECTION','RENAME_TITLE')),
  previous_snapshot JSONB NOT NULL CHECK (jsonb_typeof(previous_snapshot) = 'object'),
  new_snapshot JSONB NOT NULL CHECK (jsonb_typeof(new_snapshot) = 'object'),
  provider VARCHAR(50) NOT NULL,
  provider_model VARCHAR(100) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  undone_at TIMESTAMPTZ NULL
);

CREATE INDEX IF NOT EXISTS generated_material_edits_lesson_idx
  ON generated_material_edits (lesson_id, instructor_id, created_at DESC)
  WHERE undone_at IS NULL;

-- Instructor-authored mathematical solution activities and student image submissions.
CREATE TABLE IF NOT EXISTS solution_activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), lesson_id UUID NOT NULL REFERENCES lesson_sessions(id) ON DELETE CASCADE,
  section_id UUID NOT NULL REFERENCES sections(id) ON DELETE RESTRICT, instructor_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  title VARCHAR(200) NOT NULL CHECK (length(trim(title)) > 0), problem_text TEXT NOT NULL CHECK (length(trim(problem_text)) > 0),
  instructions TEXT NOT NULL DEFAULT '', rubric_text TEXT NULL, max_points NUMERIC(10,2) NOT NULL CHECK (max_points > 0 AND max_points <= 10000),
  status VARCHAR(20) NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','PUBLISHED','CLOSED')), due_at TIMESTAMPTZ NULL,
  published_at TIMESTAMPTZ NULL, closed_at TIMESTAMPTZ NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS solution_activities_lesson_status_idx ON solution_activities (lesson_id,status,created_at DESC);
CREATE INDEX IF NOT EXISTS solution_activities_instructor_idx ON solution_activities (instructor_id,updated_at DESC);

CREATE TABLE IF NOT EXISTS solution_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), activity_id UUID NOT NULL REFERENCES solution_activities(id) ON DELETE CASCADE,
  lesson_id UUID NOT NULL REFERENCES lesson_sessions(id) ON DELETE CASCADE, section_id UUID NOT NULL REFERENCES sections(id) ON DELETE RESTRICT,
  student_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE, storage_provider VARCHAR(30) NOT NULL DEFAULT 'LOCAL', storage_key TEXT NOT NULL,
  original_filename VARCHAR(255) NOT NULL, mime_type VARCHAR(50) NOT NULL, file_size INTEGER NOT NULL CHECK (file_size > 0),
  extracted_solution_text TEXT NOT NULL DEFAULT '', recognized_math JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(recognized_math)='array'),
  recognition_result JSONB NULL CHECK (recognition_result IS NULL OR jsonb_typeof(recognition_result)='object'),
  recognition_status VARCHAR(24) NOT NULL DEFAULT 'PENDING' CHECK (recognition_status IN ('PENDING','PROCESSING','READY','FAILED')),
  recognition_failure TEXT NULL, status VARCHAR(24) NOT NULL DEFAULT 'SUBMITTED' CHECK (status IN ('SUBMITTED','PROCESSING','READY_FOR_REVIEW','AI_REVIEWED','GRADED')),
  submission_revision INTEGER NOT NULL DEFAULT 1 CHECK (submission_revision > 0), final_score NUMERIC(10,2) NULL CHECK (final_score IS NULL OR final_score >= 0),
  instructor_feedback TEXT NULL, graded_by UUID NULL REFERENCES users(id) ON DELETE RESTRICT, graded_at TIMESTAMPTZ NULL,
  feedback_released_at TIMESTAMPTZ NULL, submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT solution_submissions_activity_student_unique UNIQUE(activity_id,student_id)
);
CREATE INDEX IF NOT EXISTS solution_submissions_activity_status_idx ON solution_submissions (activity_id,status,submitted_at DESC);
CREATE INDEX IF NOT EXISTS solution_submissions_student_idx ON solution_submissions (student_id,updated_at DESC);

CREATE TABLE IF NOT EXISTS solution_submission_ai_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), submission_id UUID NOT NULL REFERENCES solution_submissions(id) ON DELETE CASCADE,
  submission_revision INTEGER NOT NULL CHECK (submission_revision > 0), instructor_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  assessment VARCHAR(24) NOT NULL CHECK (assessment IN ('LIKELY_CORRECT','NEEDS_REVIEW','LIKELY_INCORRECT')), summary TEXT NOT NULL,
  strengths JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(strengths)='array'),
  possible_errors JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(possible_errors)='array'), suggested_feedback TEXT NOT NULL DEFAULT '',
  confidence NUMERIC(4,3) NOT NULL CHECK (confidence BETWEEN 0 AND 1), provider VARCHAR(50) NOT NULL, provider_model VARCHAR(100) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS solution_ai_reviews_submission_revision_idx ON solution_submission_ai_reviews (submission_id,submission_revision,created_at DESC);


-- Phase 6: published student learning, quiz attempts, deterministic grading, and analytics.
ALTER TABLE generated_lesson_materials
  ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS published_snapshot JSONB NULL;

CREATE UNIQUE INDEX IF NOT EXISTS generated_lesson_materials_active_type_unique
  ON generated_lesson_materials (lesson_id, context_version_id, instructor_id, material_type)
  WHERE removed = FALSE;

CREATE INDEX IF NOT EXISTS generated_lesson_materials_published_snapshot_idx
  ON generated_lesson_materials (lesson_id, context_version_id, display_order)
  WHERE published_snapshot IS NOT NULL AND outdated = FALSE;

CREATE INDEX IF NOT EXISTS generated_lesson_materials_student_published_idx
  ON generated_lesson_materials (lesson_id, context_version_id, display_order)
  WHERE published_at IS NOT NULL AND removed = FALSE AND outdated = FALSE;

CREATE TABLE IF NOT EXISTS quiz_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quiz_id UUID NOT NULL REFERENCES lesson_quizzes(id) ON DELETE CASCADE,
  lesson_id UUID NOT NULL REFERENCES lesson_sessions(id) ON DELETE CASCADE,
  section_id UUID NOT NULL REFERENCES sections(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status VARCHAR(20) NOT NULL DEFAULT 'IN_PROGRESS'
    CHECK (status IN ('IN_PROGRESS','SUBMITTED','GRADED')),
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  submitted_at TIMESTAMPTZ NULL,
  score NUMERIC(10,2) NULL CHECK (score IS NULL OR score >= 0),
  max_score NUMERIC(10,2) NULL CHECK (max_score IS NULL OR max_score >= 0),
  percentage NUMERIC(6,2) NULL CHECK (percentage IS NULL OR percentage BETWEEN 0 AND 100),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT quiz_attempts_student_quiz_unique UNIQUE (quiz_id, student_id),
  CONSTRAINT quiz_attempts_submission_state_check CHECK (
    (status = 'IN_PROGRESS' AND submitted_at IS NULL)
    OR (status IN ('SUBMITTED','GRADED') AND submitted_at IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS quiz_attempts_student_history_idx
  ON quiz_attempts (student_id, submitted_at DESC, created_at DESC);
CREATE INDEX IF NOT EXISTS quiz_attempts_quiz_status_idx
  ON quiz_attempts (quiz_id, status, submitted_at DESC);
CREATE INDEX IF NOT EXISTS quiz_attempts_section_status_idx
  ON quiz_attempts (section_id, status, submitted_at DESC);

CREATE TABLE IF NOT EXISTS quiz_attempt_answers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  attempt_id UUID NOT NULL REFERENCES quiz_attempts(id) ON DELETE CASCADE,
  question_id UUID NOT NULL REFERENCES lesson_quiz_questions(id) ON DELETE RESTRICT,
  answer_text TEXT NOT NULL DEFAULT '',
  is_correct BOOLEAN NULL,
  points_awarded NUMERIC(10,2) NULL CHECK (points_awarded IS NULL OR points_awarded >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT quiz_attempt_answers_attempt_question_unique UNIQUE (attempt_id, question_id)
);

CREATE INDEX IF NOT EXISTS quiz_attempt_answers_attempt_idx
  ON quiz_attempt_answers (attempt_id, question_id);
CREATE INDEX IF NOT EXISTS quiz_attempt_answers_question_idx
  ON quiz_attempt_answers (question_id, is_correct);

-- Quiz-integrated handwritten problem-solving (additive).

-- Extend existing quiz attempts; retain historical Solution Activity tables/data.
ALTER TABLE lesson_quiz_questions DROP CONSTRAINT IF EXISTS lesson_quiz_questions_question_type_check;
ALTER TABLE lesson_quiz_questions ADD CONSTRAINT lesson_quiz_questions_question_type_check
  CHECK (question_type IN ('MULTIPLE_CHOICE','TRUE_FALSE','SHORT_ANSWER','PROBLEM_SOLVING'));
ALTER TABLE lesson_quiz_questions ADD COLUMN IF NOT EXISTS max_points NUMERIC(10,2) NOT NULL DEFAULT 1 CHECK (max_points > 0 AND max_points <= 10000);
ALTER TABLE lesson_quiz_questions ADD COLUMN IF NOT EXISTS problem_settings JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(problem_settings)='object');
ALTER TABLE quiz_attempt_answers ADD COLUMN IF NOT EXISTS solution_file JSONB NULL CHECK (solution_file IS NULL OR jsonb_typeof(solution_file)='object');
ALTER TABLE quiz_attempt_answers ADD COLUMN IF NOT EXISTS solution_revision INTEGER NOT NULL DEFAULT 0;
ALTER TABLE quiz_attempt_answers ADD COLUMN IF NOT EXISTS recognition_status VARCHAR(20) NOT NULL DEFAULT 'PENDING' CHECK (recognition_status IN ('PENDING','PROCESSING','READY','FAILED'));
ALTER TABLE quiz_attempt_answers ADD COLUMN IF NOT EXISTS recognition_result JSONB NULL;
ALTER TABLE quiz_attempt_answers ADD COLUMN IF NOT EXISTS recognition_failure TEXT NULL;
ALTER TABLE quiz_attempt_answers ADD COLUMN IF NOT EXISTS ai_review JSONB NULL;
ALTER TABLE quiz_attempt_answers ADD COLUMN IF NOT EXISTS graded_by UUID NULL REFERENCES users(id) ON DELETE RESTRICT;
ALTER TABLE quiz_attempt_answers ADD COLUMN IF NOT EXISTS graded_at TIMESTAMPTZ NULL;
ALTER TABLE quiz_attempt_answers ADD COLUMN IF NOT EXISTS instructor_feedback TEXT NOT NULL DEFAULT '';
