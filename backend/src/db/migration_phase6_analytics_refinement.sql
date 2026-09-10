BEGIN;

ALTER TABLE lesson_context_chunks
  ADD COLUMN IF NOT EXISTS content_type VARCHAR(20);

UPDATE lesson_context_chunks
SET content_type = 'OTHER'
WHERE content_type IS NULL;

ALTER TABLE lesson_context_chunks
  ALTER COLUMN content_type SET DEFAULT 'OTHER',
  ALTER COLUMN content_type SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'lesson_context_chunks_content_type_check'
      AND conrelid = 'lesson_context_chunks'::regclass
  ) THEN
    ALTER TABLE lesson_context_chunks
      ADD CONSTRAINT lesson_context_chunks_content_type_check
      CHECK (content_type IN ('EXPLANATION','EXAMPLE','PROBLEM','FORMULA','DEFINITION','OTHER'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS lesson_context_chunks_approved_content_type_idx
  ON lesson_context_chunks (lesson_id, content_type)
  WHERE removed = FALSE;

COMMIT;
