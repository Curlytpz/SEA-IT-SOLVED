-- SEA-IT-SOLVED multi-plane camera calibration capture regions
-- Idempotent and additive: existing single-plane calibrations and captures remain valid.

BEGIN;

CREATE TABLE IF NOT EXISTS lesson_capture_planes (
  id                    UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  capture_id            UUID         NOT NULL REFERENCES lesson_captures(id) ON DELETE CASCADE,
  calibration_plane_id  VARCHAR(100) NOT NULL,
  label                 VARCHAR(80)  NOT NULL,
  plane_order           INTEGER      NOT NULL CHECK (plane_order > 0),
  corners               JSONB        NOT NULL CHECK (jsonb_typeof(corners) = 'object'),
  storage_provider      VARCHAR(30)  NOT NULL DEFAULT 'LOCAL',
  storage_key           TEXT         NOT NULL,
  mime_type             VARCHAR(50)  NOT NULL,
  file_size             INTEGER      NOT NULL CHECK (file_size > 0),
  width                 INTEGER      NOT NULL CHECK (width > 0),
  height                INTEGER      NOT NULL CHECK (height > 0),
  created_at            TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS lesson_capture_planes_capture_order_unique
  ON lesson_capture_planes (capture_id, plane_order);
CREATE UNIQUE INDEX IF NOT EXISTS lesson_capture_planes_capture_plane_unique
  ON lesson_capture_planes (capture_id, calibration_plane_id);
CREATE INDEX IF NOT EXISTS lesson_capture_planes_capture_idx
  ON lesson_capture_planes (capture_id, plane_order);

COMMIT;