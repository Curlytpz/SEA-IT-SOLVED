-- SEA-IT-SOLVED Phase 3B: microphone processing and Smart Auto Capture settings
-- Idempotent: safe to run more than once in pgAdmin Query Tool.

BEGIN;

ALTER TABLE hardware_settings
  ADD COLUMN IF NOT EXISTS microphone_noise_suppression BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS auto_capture_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS auto_capture_mode VARCHAR(20) NOT NULL DEFAULT 'SMART_AUTO',
  ADD COLUMN IF NOT EXISTS board_fill_sensitivity VARCHAR(10) NOT NULL DEFAULT 'MEDIUM',
  ADD COLUMN IF NOT EXISTS minimum_content_change_percent INTEGER NOT NULL DEFAULT 20,
  ADD COLUMN IF NOT EXISTS stability_seconds INTEGER NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS cooldown_seconds INTEGER NOT NULL DEFAULT 30,
  ADD COLUMN IF NOT EXISTS interval_minutes INTEGER NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS capture_while_paused BOOLEAN NOT NULL DEFAULT FALSE;

DO $$ BEGIN
  ALTER TABLE hardware_settings
    ADD CONSTRAINT hardware_settings_auto_capture_mode_check
    CHECK (auto_capture_mode IN ('MANUAL', 'SMART_AUTO', 'INTERVAL'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE hardware_settings
    ADD CONSTRAINT hardware_settings_board_fill_sensitivity_check
    CHECK (board_fill_sensitivity IN ('LOW', 'MEDIUM', 'HIGH'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE hardware_settings
    ADD CONSTRAINT hardware_settings_minimum_content_change_check
    CHECK (minimum_content_change_percent BETWEEN 1 AND 100);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE hardware_settings
    ADD CONSTRAINT hardware_settings_stability_seconds_check
    CHECK (stability_seconds BETWEEN 1 AND 30);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE hardware_settings
    ADD CONSTRAINT hardware_settings_cooldown_seconds_check
    CHECK (cooldown_seconds BETWEEN 5 AND 3600);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE hardware_settings
    ADD CONSTRAINT hardware_settings_interval_minutes_check
    CHECK (interval_minutes BETWEEN 1 AND 240);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

COMMIT;
