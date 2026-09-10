BEGIN;

CREATE TABLE IF NOT EXISTS lesson_chat_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id UUID NOT NULL REFERENCES lesson_sessions(id) ON DELETE CASCADE,
  context_version_id UUID NOT NULL REFERENCES lesson_context_versions(id) ON DELETE CASCADE,
  instructor_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT lesson_chat_sessions_context_unique UNIQUE (lesson_id, context_version_id, instructor_id)
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
  source_references JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(source_references) = 'array'),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE lesson_chat_messages
  ADD COLUMN IF NOT EXISTS message_type VARCHAR(20) NOT NULL DEFAULT 'ASK';

CREATE INDEX IF NOT EXISTS lesson_chat_messages_session_idx
  ON lesson_chat_messages (session_id, created_at, id);

ALTER TABLE generated_lesson_materials
  ADD COLUMN IF NOT EXISTS removed BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE generated_lesson_materials
  ADD COLUMN IF NOT EXISTS display_order INTEGER NULL;

CREATE TABLE IF NOT EXISTS generated_material_edits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  generated_material_id UUID NOT NULL REFERENCES generated_lesson_materials(id) ON DELETE CASCADE,
  lesson_id UUID NOT NULL REFERENCES lesson_sessions(id) ON DELETE CASCADE,
  context_version_id UUID NOT NULL REFERENCES lesson_context_versions(id) ON DELETE CASCADE,
  instructor_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  edit_instruction TEXT NOT NULL,
  action VARCHAR(30) NOT NULL CHECK (action IN ('UPDATE_SECTION','ADD_SECTION','REMOVE_SECTION','RENAME_TITLE')),
  previous_snapshot JSONB NOT NULL CHECK (jsonb_typeof(previous_snapshot) = 'object'),
  new_snapshot JSONB NOT NULL CHECK (jsonb_typeof(new_snapshot) = 'object'),
  provider VARCHAR(50) NOT NULL,
  provider_model VARCHAR(100) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  undone_at TIMESTAMPTZ NULL
);

CREATE INDEX IF NOT EXISTS generated_material_edits_lesson_idx
  ON generated_material_edits (lesson_id, instructor_id, created_at DESC)
  WHERE undone_at IS NULL;

COMMIT;
