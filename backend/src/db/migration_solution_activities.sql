BEGIN;

CREATE TABLE IF NOT EXISTS solution_activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id UUID NOT NULL REFERENCES lesson_sessions(id) ON DELETE CASCADE,
  section_id UUID NOT NULL REFERENCES sections(id) ON DELETE RESTRICT,
  instructor_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  title VARCHAR(200) NOT NULL CHECK (length(trim(title)) > 0),
  problem_text TEXT NOT NULL CHECK (length(trim(problem_text)) > 0),
  instructions TEXT NOT NULL DEFAULT '',
  rubric_text TEXT NULL,
  max_points NUMERIC(10,2) NOT NULL CHECK (max_points > 0 AND max_points <= 10000),
  status VARCHAR(20) NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','PUBLISHED','CLOSED')),
  due_at TIMESTAMPTZ NULL,
  published_at TIMESTAMPTZ NULL,
  closed_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS solution_activities_lesson_status_idx ON solution_activities (lesson_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS solution_activities_instructor_idx ON solution_activities (instructor_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS solution_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  activity_id UUID NOT NULL REFERENCES solution_activities(id) ON DELETE CASCADE,
  lesson_id UUID NOT NULL REFERENCES lesson_sessions(id) ON DELETE CASCADE,
  section_id UUID NOT NULL REFERENCES sections(id) ON DELETE RESTRICT,
  student_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  storage_provider VARCHAR(30) NOT NULL DEFAULT 'LOCAL',
  storage_key TEXT NOT NULL,
  original_filename VARCHAR(255) NOT NULL,
  mime_type VARCHAR(50) NOT NULL,
  file_size INTEGER NOT NULL CHECK (file_size > 0),
  extracted_solution_text TEXT NOT NULL DEFAULT '',
  recognized_math JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(recognized_math) = 'array'),
  recognition_result JSONB NULL CHECK (recognition_result IS NULL OR jsonb_typeof(recognition_result) = 'object'),
  recognition_status VARCHAR(24) NOT NULL DEFAULT 'PENDING' CHECK (recognition_status IN ('PENDING','PROCESSING','READY','FAILED')),
  recognition_failure TEXT NULL,
  status VARCHAR(24) NOT NULL DEFAULT 'SUBMITTED' CHECK (status IN ('SUBMITTED','PROCESSING','READY_FOR_REVIEW','AI_REVIEWED','GRADED')),
  submission_revision INTEGER NOT NULL DEFAULT 1 CHECK (submission_revision > 0),
  final_score NUMERIC(10,2) NULL CHECK (final_score IS NULL OR final_score >= 0),
  instructor_feedback TEXT NULL,
  graded_by UUID NULL REFERENCES users(id) ON DELETE RESTRICT,
  graded_at TIMESTAMPTZ NULL,
  feedback_released_at TIMESTAMPTZ NULL,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT solution_submissions_activity_student_unique UNIQUE (activity_id, student_id)
);

CREATE INDEX IF NOT EXISTS solution_submissions_activity_status_idx ON solution_submissions (activity_id, status, submitted_at DESC);
CREATE INDEX IF NOT EXISTS solution_submissions_student_idx ON solution_submissions (student_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS solution_submission_ai_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id UUID NOT NULL REFERENCES solution_submissions(id) ON DELETE CASCADE,
  submission_revision INTEGER NOT NULL CHECK (submission_revision > 0),
  instructor_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  assessment VARCHAR(24) NOT NULL CHECK (assessment IN ('LIKELY_CORRECT','NEEDS_REVIEW','LIKELY_INCORRECT')),
  summary TEXT NOT NULL,
  strengths JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(strengths) = 'array'),
  possible_errors JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(possible_errors) = 'array'),
  suggested_feedback TEXT NOT NULL DEFAULT '',
  confidence NUMERIC(4,3) NOT NULL CHECK (confidence BETWEEN 0 AND 1),
  provider VARCHAR(50) NOT NULL,
  provider_model VARCHAR(100) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS solution_ai_reviews_submission_revision_idx ON solution_submission_ai_reviews (submission_id, submission_revision, created_at DESC);

COMMIT;
