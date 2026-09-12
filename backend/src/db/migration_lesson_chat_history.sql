BEGIN;

ALTER TABLE lesson_chat_sessions
  ADD COLUMN IF NOT EXISTS title VARCHAR(120);

UPDATE lesson_chat_sessions AS session
SET title = COALESCE(
  NULLIF(LEFT(REGEXP_REPLACE((
    SELECT message.content
    FROM lesson_chat_messages AS message
    WHERE message.session_id = session.id
      AND message.role = 'USER'
    ORDER BY message.created_at, message.id
    LIMIT 1
  ), '\\s+', ' ', 'g'), 120), ''),
  'Previous Conversation'
)
WHERE session.title IS NULL;

UPDATE lesson_chat_sessions
SET title = 'Previous Conversation'
WHERE title IS NULL OR BTRIM(title) = '';

ALTER TABLE lesson_chat_sessions
  ALTER COLUMN title SET DEFAULT 'New Conversation',
  ALTER COLUMN title SET NOT NULL;

ALTER TABLE lesson_chat_sessions
  DROP CONSTRAINT IF EXISTS lesson_chat_sessions_context_unique;

CREATE INDEX IF NOT EXISTS lesson_chat_sessions_context_idx
  ON lesson_chat_sessions (lesson_id, context_version_id, instructor_id, updated_at DESC);

COMMIT;
