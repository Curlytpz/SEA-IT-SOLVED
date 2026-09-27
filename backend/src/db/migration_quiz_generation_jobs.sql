BEGIN;

CREATE TABLE IF NOT EXISTS quiz_generation_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  generation_id VARCHAR(100) NOT NULL,
  lesson_id UUID NOT NULL REFERENCES lesson_sessions(id) ON DELETE CASCADE,
  context_version_id UUID NOT NULL REFERENCES lesson_context_versions(id) ON DELETE RESTRICT,
  instructor_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  session_id UUID NOT NULL REFERENCES lesson_chat_sessions(id) ON DELETE CASCADE,
  prompt TEXT NOT NULL CHECK (length(trim(prompt)) > 0),
  difficulty VARCHAR(10) NOT NULL CHECK (difficulty IN ('EASY','MEDIUM','HARD')),
  question_count INTEGER NOT NULL CHECK (question_count BETWEEN 1 AND 20),
  question_type VARCHAR(30) NOT NULL CHECK (question_type IN ('MULTIPLE_CHOICE','TRUE_FALSE','PROBLEM_SOLVING','MIXED')),
  skip_user_message BOOLEAN NOT NULL DEFAULT FALSE,
  status VARCHAR(20) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','PROCESSING','COMPLETED','FAILED')),
  phase VARCHAR(40) NOT NULL DEFAULT 'QUEUED',
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  max_attempts INTEGER NOT NULL DEFAULT 2 CHECK (max_attempts BETWEEN 1 AND 5),
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  worker_id VARCHAR(180) NULL,
  locked_at TIMESTAMPTZ NULL,
  quiz_id UUID NULL REFERENCES lesson_quizzes(id) ON DELETE SET NULL,
  failure_code VARCHAR(80) NULL,
  failure_message TEXT NULL,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at TIMESTAMPTZ NULL,
  completed_at TIMESTAMPTZ NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT quiz_generation_jobs_generation_unique UNIQUE (lesson_id, instructor_id, generation_id)
);

CREATE INDEX IF NOT EXISTS quiz_generation_jobs_queue_idx
  ON quiz_generation_jobs (next_attempt_at, requested_at)
  WHERE status = 'PENDING';

CREATE INDEX IF NOT EXISTS quiz_generation_jobs_owner_idx
  ON quiz_generation_jobs (lesson_id, instructor_id, requested_at DESC);

COMMIT;
