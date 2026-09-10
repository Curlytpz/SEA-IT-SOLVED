-- SEA-IT-SOLVED - Instructor + subject + case-insensitive section-name uniqueness
-- Safe to run more than once. Only section-name uniqueness indexes are replaced.
--
-- Section names may be shared across instructors or subjects. Within one
-- instructor and subject, names are unique without regard to letter case.

BEGIN;

DROP INDEX IF EXISTS sections_subject_name_unique;
ALTER TABLE sections DROP CONSTRAINT IF EXISTS unique_instructor_subject_section;
DROP INDEX IF EXISTS unique_instructor_subject_section;
DROP INDEX IF EXISTS sections_instructor_subject_name_unique;

CREATE UNIQUE INDEX sections_instructor_subject_name_unique
ON sections (
    instructor_id,
    subject_id,
    LOWER(section_name)
);

COMMIT;