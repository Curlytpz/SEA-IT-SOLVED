BEGIN;

ALTER TABLE generated_lesson_materials
  ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ NULL;

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

COMMIT;
