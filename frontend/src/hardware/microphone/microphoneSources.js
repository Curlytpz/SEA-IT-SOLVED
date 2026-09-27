export const SIMULATED_MICROPHONE_SOURCE_KEY = 'mock-lapel-microphone';
export const BROWSER_DEFAULT_MICROPHONE_SOURCE_KEY = 'browser-default-microphone';

export function defaultMicrophoneSourceKey(mode) {
  return mode === 'SIMULATED' ? SIMULATED_MICROPHONE_SOURCE_KEY : '';
}

export function microphoneSimulationEnabled(environment = import.meta.env || {}) {
  const explicitlyEnabled = String(environment.VITE_ENABLE_MICROPHONE_SIMULATION || '').trim().toLowerCase() === 'true';
  return explicitlyEnabled || environment.DEV === true || ['development', 'test'].includes(environment.MODE);
}

export function resolveMicrophoneMode(mode, environment = import.meta.env || {}) {
  return mode === 'SIMULATED' && microphoneSimulationEnabled(environment) ? 'SIMULATED' : 'BROWSER';
}

export function resolveMicrophoneSourceKey(mode, sourceKey, environment = import.meta.env || {}) {
  const resolvedMode = resolveMicrophoneMode(mode, environment);
  if (resolvedMode === 'SIMULATED') return SIMULATED_MICROPHONE_SOURCE_KEY;
  const candidate = String(sourceKey || '').trim();
  return candidate === SIMULATED_MICROPHONE_SOURCE_KEY ? '' : candidate;
}

export function resolveMicrophoneSettings(settings = {}, environment = import.meta.env || {}) {
  const microphoneMode = resolveMicrophoneMode(settings.microphoneMode, environment);
  return {
    ...settings,
    microphoneMode,
    microphoneSourceKey: resolveMicrophoneSourceKey(
      microphoneMode,
      settings.microphoneSourceKey,
      environment,
    ),
    microphoneNoiseSuppression: settings.microphoneNoiseSuppression !== false,
  };
}

export function microphoneRecordingMetadata(session = {}, settings = {}, environment = import.meta.env || {}) {
  const resolved = resolveMicrophoneSettings({
    microphoneMode: session.mode || settings.microphoneMode,
    microphoneSourceKey: session.sourceKey || settings.microphoneSourceKey,
    microphoneNoiseSuppression: settings.microphoneNoiseSuppression,
  }, environment);
  return {
    hardwareMode: resolved.microphoneMode,
    sourceKey: resolved.microphoneSourceKey
      || (resolved.microphoneMode === 'SIMULATED'
        ? SIMULATED_MICROPHONE_SOURCE_KEY
        : BROWSER_DEFAULT_MICROPHONE_SOURCE_KEY),
  };
}
