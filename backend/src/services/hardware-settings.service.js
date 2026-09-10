const pool = require('../db/pool');
const AppError = require('../utils/AppError');

function safeSettings(row, instructorId) {
  return {
    instructorId,
    hardwareMode: row?.hardware_mode || 'SIMULATED',
    cameraSourceKey: row?.camera_source_key || null,
    microphoneMode: row?.microphone_mode || 'SIMULATED',
    microphoneSourceKey: row?.microphone_source_key || null,
    microphoneNoiseSuppression: row?.microphone_noise_suppression ?? true,
    autoCaptureEnabled: row?.auto_capture_enabled ?? true,
    autoCaptureMode: row?.auto_capture_mode || 'SMART_AUTO',
    boardFillSensitivity: row?.board_fill_sensitivity || 'MEDIUM',
    minimumContentChangePercent: row?.minimum_content_change_percent ?? 20,
    stabilitySeconds: row?.stability_seconds ?? 3,
    cooldownSeconds: row?.cooldown_seconds ?? 30,
    intervalMinutes: row?.interval_minutes ?? 5,
    captureWhilePaused: row?.capture_while_paused ?? false,
    lightingHardwareMode: row?.lighting_hardware_mode || 'SIMULATED',
    lightingMode: row?.lighting_mode || 'AUTO',
    lightingThresholdPercent: row?.lighting_threshold_percent ?? 30,
    lightingHysteresisPercent: row?.lighting_hysteresis_percent ?? 5,
    lightingBrightnessPercent: row?.lighting_brightness_percent ?? 80,
    simulatedAmbientLightPercent: row?.simulated_ambient_light_percent ?? 35,
    updatedAt: row?.updated_at || null,
  };
}

function integerSetting(value, fallback, label, minimum, maximum) {
  const parsed = value === undefined ? fallback : Number(value);
  if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new AppError(`${label} must be between ${minimum} and ${maximum}.`, 400);
  }
  return parsed;
}

async function getSettings(instructorId) {
  const { rows } = await pool.query('SELECT * FROM hardware_settings WHERE instructor_id = $1', [instructorId]);
  return safeSettings(rows[0], instructorId);
}

async function updateSettings(instructorId, input) {
  const current = await getSettings(instructorId);
  const hardwareMode = input.hardwareMode ?? current.hardwareMode;
  const cameraSourceKey = input.cameraSourceKey === undefined ? current.cameraSourceKey : input.cameraSourceKey;
  const microphoneMode = input.microphoneMode ?? current.microphoneMode;
  const microphoneSourceKey = input.microphoneSourceKey === undefined ? current.microphoneSourceKey : input.microphoneSourceKey;
  const microphoneNoiseSuppression = input.microphoneNoiseSuppression ?? current.microphoneNoiseSuppression;
  const autoCaptureEnabled = input.autoCaptureEnabled ?? current.autoCaptureEnabled;
  const autoCaptureMode = input.autoCaptureMode ?? current.autoCaptureMode;
  const boardFillSensitivity = input.boardFillSensitivity ?? current.boardFillSensitivity;
  const captureWhilePaused = input.captureWhilePaused ?? current.captureWhilePaused;
  const minimumContentChangePercent = integerSetting(input.minimumContentChangePercent, current.minimumContentChangePercent, 'Minimum content change', 1, 100);
  const stabilitySeconds = integerSetting(input.stabilitySeconds, current.stabilitySeconds, 'Stability time', 1, 30);
  const cooldownSeconds = integerSetting(input.cooldownSeconds, current.cooldownSeconds, 'Capture cooldown', 5, 3600);
  const intervalMinutes = integerSetting(input.intervalMinutes, current.intervalMinutes, 'Capture interval', 1, 240);
  const lightingHardwareMode = input.lightingHardwareMode ?? current.lightingHardwareMode;
  const lightingMode = input.lightingMode ?? current.lightingMode;
  const lightingThresholdPercent = integerSetting(input.lightingThresholdPercent, current.lightingThresholdPercent, 'Lighting threshold', 0, 100);
  const lightingHysteresisPercent = integerSetting(input.lightingHysteresisPercent, current.lightingHysteresisPercent, 'Lighting hysteresis', 0, 50);
  const lightingBrightnessPercent = integerSetting(input.lightingBrightnessPercent, current.lightingBrightnessPercent, 'LED brightness', 0, 100);
  const simulatedAmbientLightPercent = integerSetting(input.simulatedAmbientLightPercent, current.simulatedAmbientLightPercent, 'Simulated ambient light', 0, 100);

  if (!['SIMULATED', 'BROWSER'].includes(hardwareMode)) throw new AppError('Hardware mode must be SIMULATED or BROWSER.', 400);
  if (!['SIMULATED', 'BROWSER'].includes(microphoneMode)) throw new AppError('Microphone mode must be SIMULATED or BROWSER.', 400);
  if (!['MANUAL', 'SMART_AUTO', 'INTERVAL'].includes(autoCaptureMode)) throw new AppError('Auto capture mode is invalid.', 400);
  if (!['LOW', 'MEDIUM', 'HIGH'].includes(boardFillSensitivity)) throw new AppError('Board fill sensitivity is invalid.', 400);
  if (!['SIMULATED', 'RASPBERRY_PI'].includes(lightingHardwareMode)) throw new AppError('Lighting hardware mode is invalid.', 400);
  if (!['AUTO', 'ON', 'OFF'].includes(lightingMode)) throw new AppError('Lighting mode must be AUTO, ON, or OFF.', 400);
  if (lightingThresholdPercent + lightingHysteresisPercent > 100) throw new AppError('Lighting threshold plus hysteresis cannot exceed 100.', 400);
  if (typeof microphoneNoiseSuppression !== 'boolean' || typeof autoCaptureEnabled !== 'boolean' || typeof captureWhilePaused !== 'boolean') throw new AppError('Hardware toggle settings must be true or false.', 400);

  const source = typeof cameraSourceKey === 'string' && cameraSourceKey.trim() ? cameraSourceKey.trim().slice(0, 255) : null;
  const microphoneSource = typeof microphoneSourceKey === 'string' && microphoneSourceKey.trim() ? microphoneSourceKey.trim().slice(0, 255) : null;
  const { rows } = await pool.query(
    `INSERT INTO hardware_settings
       (instructor_id, hardware_mode, camera_source_key, microphone_mode, microphone_source_key,
        microphone_noise_suppression, auto_capture_enabled, auto_capture_mode, board_fill_sensitivity,
        minimum_content_change_percent, stability_seconds, cooldown_seconds, interval_minutes, capture_while_paused,
        lighting_hardware_mode, lighting_mode, lighting_threshold_percent, lighting_hysteresis_percent,
        lighting_brightness_percent, simulated_ambient_light_percent)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)
     ON CONFLICT (instructor_id) DO UPDATE
       SET hardware_mode = EXCLUDED.hardware_mode,
           camera_source_key = EXCLUDED.camera_source_key,
           microphone_mode = EXCLUDED.microphone_mode,
           microphone_source_key = EXCLUDED.microphone_source_key,
           microphone_noise_suppression = EXCLUDED.microphone_noise_suppression,
           auto_capture_enabled = EXCLUDED.auto_capture_enabled,
           auto_capture_mode = EXCLUDED.auto_capture_mode,
           board_fill_sensitivity = EXCLUDED.board_fill_sensitivity,
           minimum_content_change_percent = EXCLUDED.minimum_content_change_percent,
           stability_seconds = EXCLUDED.stability_seconds,
           cooldown_seconds = EXCLUDED.cooldown_seconds,
           interval_minutes = EXCLUDED.interval_minutes,
           capture_while_paused = EXCLUDED.capture_while_paused,
           lighting_hardware_mode = EXCLUDED.lighting_hardware_mode,
           lighting_mode = EXCLUDED.lighting_mode,
           lighting_threshold_percent = EXCLUDED.lighting_threshold_percent,
           lighting_hysteresis_percent = EXCLUDED.lighting_hysteresis_percent,
           lighting_brightness_percent = EXCLUDED.lighting_brightness_percent,
           simulated_ambient_light_percent = EXCLUDED.simulated_ambient_light_percent,
           updated_at = NOW()
     RETURNING *`,
    [instructorId, hardwareMode, source, microphoneMode, microphoneSource,
      microphoneNoiseSuppression, autoCaptureEnabled, autoCaptureMode, boardFillSensitivity,
      minimumContentChangePercent, stabilitySeconds, cooldownSeconds, intervalMinutes, captureWhilePaused,
      lightingHardwareMode, lightingMode, lightingThresholdPercent, lightingHysteresisPercent,
      lightingBrightnessPercent, simulatedAmbientLightPercent]
  );
  return safeSettings(rows[0], instructorId);
}

module.exports = { getSettings, updateSettings };