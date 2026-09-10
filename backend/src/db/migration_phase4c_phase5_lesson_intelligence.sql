BEGIN;

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
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS lesson_context_chunks_version_order_idx
  ON lesson_context_chunks (context_version_id, chunk_order);

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
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
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
  status VARCHAR(20) NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','PUBLISHED','CLOSED')),
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

COMMIT;
