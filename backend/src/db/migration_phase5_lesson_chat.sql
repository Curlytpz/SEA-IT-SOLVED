BEGIN;

CREATE TABLE IF NOT EXISTS lesson_chat_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id UUID NOT NULL REFERENCES lesson_sessions(id) ON DELETE CASCADE,
  context_version_id UUID NOT NULL REFERENCES lesson_context_versions(id) ON DELETE CASCADE,
  instructor_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT lesson_chat_sessions_context_unique
    UNIQUE (lesson_id, context_version_id, instructor_id)
);

CREATE INDEX IF NOT EXISTS lesson_chat_sessions_lesson_idx
  ON lesson_chat_sessions (lesson_id, instructor_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS lesson_chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES lesson_chat_sessions(id) ON DELETE CASCADE,
  lesson_id UUID NOT NULL REFERENCES lesson_sessions(id) ON DELETE CASCADE,
  instructor_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  role VARCHAR(12) NOT NULL CHECK (role IN ('USER','ASSISTANT')),
  content TEXT NOT NULL CHECK (length(trim(content)) > 0),
  source_references JSONB NOT NULL DEFAULT '[]'::jsonb
    CHECK (jsonb_typeof(source_references) = 'array'),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(metadata) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS lesson_chat_messages_session_idx
  ON lesson_chat_messages (session_id, created_at, id);

COMMIT;

