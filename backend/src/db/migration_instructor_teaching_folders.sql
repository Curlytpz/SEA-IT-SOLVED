BEGIN;

CREATE TABLE IF NOT EXISTS teaching_folders (
  id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  instructor_id UUID         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name          VARCHAR(120) NOT NULL CHECK (LENGTH(TRIM(name)) > 0),
  display_order INTEGER      NOT NULL DEFAULT 0 CHECK (display_order >= 0),
  archived_at   TIMESTAMPTZ  NULL,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS teaching_folders_instructor_name_unique
  ON teaching_folders (instructor_id, LOWER(TRIM(name)));

CREATE INDEX IF NOT EXISTS teaching_folders_instructor_order_idx
  ON teaching_folders (instructor_id, archived_at, display_order, created_at);

ALTER TABLE sections
  ADD COLUMN IF NOT EXISTS teaching_folder_id UUID NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'sections_teaching_folder_id_fkey'
  ) THEN
    ALTER TABLE sections
      ADD CONSTRAINT sections_teaching_folder_id_fkey
      FOREIGN KEY (teaching_folder_id)
      REFERENCES teaching_folders(id)
      ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS sections_teaching_folder_idx
  ON sections (teaching_folder_id);

COMMIT;
