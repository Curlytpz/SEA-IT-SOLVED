-- SEA-IT-SOLVED Phase 3B: microphone settings and lesson audio recordings
-- Idempotent: safe to run more than once in pgAdmin Query Tool.

BEGIN;

ALTER TABLE hardware_settings
  ADD COLUMN IF NOT EXISTS microphone_mode VARCHAR(20) NOT NULL DEFAULT 'SIMULATED',
  ADD COLUMN IF NOT EXISTS microphone_source_key VARCHAR(255) NULL;

DO $$ BEGIN
  ALTER TABLE hardware_settings
    ADD CONSTRAINT hardware_settings_microphone_mode_check
    CHECK (microphone_mode IN ('SIMULATED', 'BROWSER'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

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

COMMIT;
