BEGIN;

ALTER TABLE lesson_quizzes
  DROP CONSTRAINT IF EXISTS lesson_quizzes_status_check;

UPDATE lesson_quizzes
SET status = 'DISABLED', updated_at = NOW()
WHERE status = 'CLOSED';

ALTER TABLE lesson_quizzes
  ADD CONSTRAINT lesson_quizzes_status_check
  CHECK (status IN ('DRAFT', 'PUBLISHED', 'DISABLED'));

COMMIT;
