BEGIN;

-- Keep the editable draft and the last instructor-published representation on
-- the same stable material row. Student reads use this snapshot exclusively.
ALTER TABLE generated_lesson_materials
  ADD COLUMN IF NOT EXISTS published_snapshot JSONB NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'generated_lesson_materials_published_snapshot_object'
      AND conrelid = 'generated_lesson_materials'::regclass
  ) THEN
    ALTER TABLE generated_lesson_materials
      ADD CONSTRAINT generated_lesson_materials_published_snapshot_object
      CHECK (published_snapshot IS NULL OR jsonb_typeof(published_snapshot) = 'object')
      NOT VALID;
  END IF;
END $$;

ALTER TABLE generated_lesson_materials
  VALIDATE CONSTRAINT generated_lesson_materials_published_snapshot_object;

-- Preserve the currently published student lesson before normalizing legacy
-- duplicates. No material content is deleted by this migration.
UPDATE generated_lesson_materials
SET published_snapshot = jsonb_build_object(
      'title', title,
      'content', content,
      'sourceReferences', source_references,
      'displayOrder', display_order,
      'generatedAt', generated_at
    )
WHERE published_at IS NOT NULL
  AND published_snapshot IS NULL;

-- Retain one canonical row per logical section. An explicit, non-undone remove
-- wins over an older active duplicate so deleted sections cannot reappear.
WITH ranked AS (
  SELECT gm.id,
         row_number() OVER (
           PARTITION BY gm.lesson_id, gm.context_version_id, gm.instructor_id, gm.material_type
           ORDER BY
             CASE
               WHEN gm.removed = TRUE AND EXISTS (
                 SELECT 1 FROM generated_material_edits edit
                 WHERE edit.generated_material_id = gm.id
                   AND edit.action = 'REMOVE_SECTION'
                   AND edit.undone_at IS NULL
               ) THEN 0
               WHEN gm.removed = FALSE THEN 1
               ELSE 2
             END,
             gm.updated_at DESC,
             gm.generated_at DESC,
             gm.id DESC
         ) AS duplicate_rank
  FROM generated_lesson_materials gm
), archived AS (
  UPDATE generated_lesson_materials gm
  SET removed = TRUE,
      published_at = NULL,
      published_snapshot = NULL,
      updated_at = NOW()
  FROM ranked
  WHERE gm.id = ranked.id
    AND ranked.duplicate_rank > 1
  RETURNING gm.id
)
SELECT count(*) FROM archived;

CREATE UNIQUE INDEX IF NOT EXISTS generated_lesson_materials_active_type_unique
  ON generated_lesson_materials (lesson_id, context_version_id, instructor_id, material_type)
  WHERE removed = FALSE;

CREATE INDEX IF NOT EXISTS generated_lesson_materials_published_snapshot_idx
  ON generated_lesson_materials (lesson_id, context_version_id, display_order)
  WHERE published_snapshot IS NOT NULL AND outdated = FALSE;

COMMIT;