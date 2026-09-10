-- ─────────────────────────────────────────────────────────────────────────
-- SEA-IT-SOLVED — Phase 2 Polish Migration
-- Run this in pgAdmin or psql ONCE against your existing database.
-- All operations are idempotent / safe to re-run.
-- ─────────────────────────────────────────────────────────────────────────

-- 1. Add PAUSED to lesson_status enum (if not already present)
DO $$
BEGIN
  ALTER TYPE lesson_status ADD VALUE IF NOT EXISTS 'PAUSED';
EXCEPTION WHEN others THEN NULL;
END $$;

-- 2. Replace the legacy status CHECK constraint. Older databases used a
--    VARCHAR/check-constraint combination that did not include PAUSED.
--    Casting to text keeps this compatible with both enum and VARCHAR columns.
ALTER TABLE lesson_sessions
  DROP CONSTRAINT IF EXISTS lesson_session_status_check;

ALTER TABLE lesson_sessions
  ADD CONSTRAINT lesson_session_status_check
  CHECK (status::text IN ('CREATED', 'ACTIVE', 'PAUSED', 'COMPLETED'));

-- 3. Drop the old ACTIVE-only unique index and replace with ACTIVE+PAUSED
DROP INDEX IF EXISTS lessons_one_active_per_section;

CREATE UNIQUE INDEX IF NOT EXISTS lesson_sessions_one_current_per_section
  ON lesson_sessions (section_id)
  WHERE status IN ('ACTIVE', 'PAUSED');

-- 4. Create the pause events table
CREATE TABLE IF NOT EXISTS lesson_pause_events (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id   UUID        NOT NULL REFERENCES lesson_sessions(id) ON DELETE CASCADE,
  paused_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resumed_at  TIMESTAMPTZ NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS pause_events_lesson_idx ON lesson_pause_events (lesson_id);
CREATE INDEX IF NOT EXISTS pause_events_open_idx   ON lesson_pause_events (lesson_id) WHERE resumed_at IS NULL;
