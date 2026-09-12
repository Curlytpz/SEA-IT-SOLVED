BEGIN;

CREATE TABLE IF NOT EXISTS quiz_tutor_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  attempt_id UUID NOT NULL REFERENCES quiz_attempts(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status VARCHAR(20) NOT NULL DEFAULT 'PROCESSING' CHECK (status IN ('PROCESSING','READY','FAILED')),
  report JSONB NULL CHECK (report IS NULL OR jsonb_typeof(report) = 'object'),
  model_version VARCHAR(100) NULL,
  generation_key UUID NULL,
  failure_code VARCHAR(80) NULL,
  generated_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT quiz_tutor_reports_attempt_unique UNIQUE (attempt_id)
);

CREATE INDEX IF NOT EXISTS quiz_tutor_reports_student_idx
  ON quiz_tutor_reports (student_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS quiz_tutor_practices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id UUID NOT NULL REFERENCES quiz_tutor_reports(id) ON DELETE CASCADE,
  attempt_id UUID NOT NULL REFERENCES quiz_attempts(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  practice_order INTEGER NOT NULL CHECK (practice_order > 0),
  topic VARCHAR(255) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'PROCESSING' CHECK (status IN ('PROCESSING','READY','FAILED')),
  content JSONB NULL CHECK (content IS NULL OR jsonb_typeof(content) = 'object'),
  student_answer TEXT NULL,
  is_correct BOOLEAN NULL,
  model_version VARCHAR(100) NULL,
  generation_key UUID NULL,
  failure_code VARCHAR(80) NULL,
  generated_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT quiz_tutor_practices_order_unique UNIQUE (report_id, practice_order)
);

CREATE INDEX IF NOT EXISTS quiz_tutor_practices_attempt_idx
  ON quiz_tutor_practices (attempt_id, practice_order);

COMMIT;
