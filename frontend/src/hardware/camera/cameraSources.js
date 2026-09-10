export const SIMULATED_CAMERA_SOURCE_KEY = 'mock-whiteboard-camera';

export function defaultCameraSourceKey(mode) {
  return mode === 'SIMULATED' ? SIMULATED_CAMERA_SOURCE_KEY : '';
}
