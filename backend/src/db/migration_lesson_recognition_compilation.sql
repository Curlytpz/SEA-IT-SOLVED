BEGIN;

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

COMMIT;
