BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'users'
      AND column_name = 'successful_login_count'
  ) THEN
    ALTER TABLE users
      ADD COLUMN successful_login_count INTEGER NOT NULL DEFAULT 0;

    -- There was no reliable login counter before this migration. Preserve an
    -- evidence-based returning state only for students who already had product
    -- activity when the column was introduced. New accounts are never backfilled.
    IF to_regclass('public.enrollments') IS NOT NULL THEN
      UPDATE users AS account
      SET successful_login_count = 1
      WHERE account.role = 'STUDENT'
        AND EXISTS (
          SELECT 1 FROM enrollments AS enrollment
          WHERE enrollment.student_id = account.id
        );
    END IF;

    IF to_regclass('public.quiz_attempts') IS NOT NULL THEN
      UPDATE users AS account
      SET successful_login_count = 1
      WHERE account.role = 'STUDENT'
        AND account.successful_login_count = 0
        AND EXISTS (
          SELECT 1 FROM quiz_attempts AS attempt
          WHERE attempt.student_id = account.id
        );
    END IF;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'users_successful_login_count_check'
      AND conrelid = 'users'::regclass
  ) THEN
    ALTER TABLE users
      ADD CONSTRAINT users_successful_login_count_check
      CHECK (successful_login_count >= 0);
  END IF;
END $$;

COMMIT;
