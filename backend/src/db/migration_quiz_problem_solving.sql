BEGIN;

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

COMMIT;
