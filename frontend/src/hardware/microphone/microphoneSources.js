export const SIMULATED_MICROPHONE_SOURCE_KEY = 'mock-lapel-microphone';

export function defaultMicrophoneSourceKey(mode) {
  return mode === 'SIMULATED' ? SIMULATED_MICROPHONE_SOURCE_KEY : '';
}
