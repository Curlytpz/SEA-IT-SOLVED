-- SEA-IT-SOLVED Phase 3C: ambient light and automatic LED configuration
-- Idempotent: safe to run more than once in pgAdmin Query Tool.

BEGIN;

ALTER TABLE hardware_settings
  ADD COLUMN IF NOT EXISTS lighting_hardware_mode VARCHAR(20) NOT NULL DEFAULT 'SIMULATED',
  ADD COLUMN IF NOT EXISTS lighting_mode VARCHAR(10) NOT NULL DEFAULT 'AUTO',
  ADD COLUMN IF NOT EXISTS lighting_threshold_percent INTEGER NOT NULL DEFAULT 30,
  ADD COLUMN IF NOT EXISTS lighting_hysteresis_percent INTEGER NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS lighting_brightness_percent INTEGER NOT NULL DEFAULT 80,
  ADD COLUMN IF NOT EXISTS simulated_ambient_light_percent INTEGER NOT NULL DEFAULT 35;

DO $$ BEGIN
  ALTER TABLE hardware_settings
    ADD CONSTRAINT hardware_settings_lighting_hardware_mode_check
    CHECK (lighting_hardware_mode IN ('SIMULATED', 'RASPBERRY_PI'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE hardware_settings
    ADD CONSTRAINT hardware_settings_lighting_mode_check
    CHECK (lighting_mode IN ('AUTO', 'ON', 'OFF'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE hardware_settings
    ADD CONSTRAINT hardware_settings_lighting_threshold_check
    CHECK (lighting_threshold_percent BETWEEN 0 AND 100);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE hardware_settings
    ADD CONSTRAINT hardware_settings_lighting_hysteresis_check
    CHECK (lighting_hysteresis_percent BETWEEN 0 AND 50);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE hardware_settings
    ADD CONSTRAINT hardware_settings_lighting_brightness_check
    CHECK (lighting_brightness_percent BETWEEN 0 AND 100);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE hardware_settings
    ADD CONSTRAINT hardware_settings_simulated_ambient_light_check
    CHECK (simulated_ambient_light_percent BETWEEN 0 AND 100);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE hardware_settings
    ADD CONSTRAINT hardware_settings_lighting_threshold_band_check
    CHECK (lighting_threshold_percent + lighting_hysteresis_percent <= 100);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

COMMIT;
