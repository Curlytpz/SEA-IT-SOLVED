BEGIN;

ALTER TABLE lesson_quizzes
  ADD COLUMN IF NOT EXISTS difficulty VARCHAR(10);

UPDATE lesson_quizzes q
SET difficulty = COALESCE(
  (SELECT qq.difficulty
   FROM lesson_quiz_questions qq
   WHERE qq.quiz_id = q.id
   ORDER BY qq.question_order
   LIMIT 1),
  'MEDIUM'
)
WHERE difficulty IS NULL;

ALTER TABLE lesson_quizzes
  ALTER COLUMN difficulty SET DEFAULT 'MEDIUM',
  ALTER COLUMN difficulty SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'lesson_quizzes_difficulty_check'
      AND conrelid = 'lesson_quizzes'::regclass
  ) THEN
    ALTER TABLE lesson_quizzes
      ADD CONSTRAINT lesson_quizzes_difficulty_check
      CHECK (difficulty IN ('EASY','MEDIUM','HARD'));
  END IF;
END $$;

COMMIT;
