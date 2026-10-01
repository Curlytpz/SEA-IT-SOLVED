export const HARDWARE_SETTINGS_SKELETON_MINIMUM_MS = 250;

export function remainingSkeletonDuration(startedAt, minimumDuration = HARDWARE_SETTINGS_SKELETON_MINIMUM_MS, now = Date.now()) {
  return Math.max(0, minimumDuration - Math.max(0, now - startedAt));
}

export function hardwareSettingsLoadError(error) {
  return error?.response?.data?.error || error?.message || 'Unable to load hardware settings. Please try again.';
}
