import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import { HARDWARE_SETTINGS_SKELETON_MINIMUM_MS, hardwareSettingsLoadError, remainingSkeletonDuration } from './hardwareSettingsHydration.js';

test('hardware settings skeleton remains visible briefly to avoid a flicker', () => {
  assert.equal(HARDWARE_SETTINGS_SKELETON_MINIMUM_MS, 250);
  assert.equal(remainingSkeletonDuration(1_000, 250, 1_100), 150);
  assert.equal(remainingSkeletonDuration(1_000, 250, 1_400), 0);
});

test('hardware settings hydration errors stay safe and retryable', () => {
  assert.equal(hardwareSettingsLoadError({ response: { data: { error: 'Saved hardware settings are unavailable.' } } }), 'Saved hardware settings are unavailable.');
  assert.equal(hardwareSettingsLoadError(new Error('Network unavailable')), 'Network unavailable');
  assert.match(hardwareSettingsLoadError(), /Unable to load hardware settings/);
});

test('settings page coordinates all first-load requests before rendering real panels', () => {
  const source = fs.readFileSync(new URL('../pages/instructor/InstructorSettings.jsx', import.meta.url), 'utf8');
  assert.match(source, /Promise\.all\(\[getHardwareSettings\(\), getCalibrations\(\)\]\)/);
  assert.match(source, /aria-busy=\{loading \|\| undefined\}/);
  assert.match(source, /HardwareSettingsSkeleton/);
  assert.match(source, /initialHardwareSettings=\{hydrated\.settings\}/);
  assert.match(source, /initialCalibrations=\{hydrated\.calibrations\}/);
  assert.match(source, />Retry</);
});
