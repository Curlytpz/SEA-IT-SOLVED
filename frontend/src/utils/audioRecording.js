import fixWebmDuration from 'fix-webm-duration';

export const SUPPORTED_RECORDING_MIME_TYPES = new Set([
  'audio/webm',
  'audio/ogg',
  'audio/wav',
  'audio/x-wav',
]);

export const MIN_RECORDING_BYTES = 4096;

function recordingError() {
  const error = new Error('The microphone recording was incomplete. Reconnect the microphone and record the lesson again.');
  error.code = 'INVALID_AUDIO_RECORDING';
  return error;
}

export function recordingMimeType(blob) {
  return String(blob?.type || '').split(';')[0].trim().toLowerCase();
}

export function validateRecordingBlob(blob) {
  const mimeType = recordingMimeType(blob);
  if (!SUPPORTED_RECORDING_MIME_TYPES.has(mimeType)) throw recordingError();
  if (!Number.isFinite(blob?.size) || blob.size < MIN_RECORDING_BYTES) throw recordingError();
  return blob;
}

export async function repairRecordingDuration(blob, durationMs, durationFixer = fixWebmDuration) {
  if (recordingMimeType(blob) !== 'audio/webm') return blob;
  if (!Number.isFinite(durationMs) || durationMs <= 0) throw recordingError();
  try {
    const repaired = await durationFixer(blob, durationMs, undefined, { logger: false });
    if (!(repaired instanceof Blob) || repaired.size < MIN_RECORDING_BYTES) throw recordingError();
    return repaired.type === blob.type ? repaired : new Blob([repaired], { type: blob.type });
  } catch (error) {
    if (error?.code === 'INVALID_AUDIO_RECORDING') throw error;
    throw recordingError();
  }
}

function extensionFor(blob) {
  const mimeType = recordingMimeType(blob);
  if (mimeType === 'audio/ogg') return 'ogg';
  if (mimeType === 'audio/wav' || mimeType === 'audio/x-wav') return 'wav';
  return 'webm';
}

export function buildAudioRecordingFormData(payload) {
  validateRecordingBlob(payload?.blob);
  const form = new FormData();
  form.append('audio', payload.blob, `lesson-recording.${extensionFor(payload.blob)}`);
  for (const [key, value] of Object.entries(payload.metadata || {})) {
    if (value !== undefined && value !== null) form.append(key, key === 'pauses' ? JSON.stringify(value) : String(value));
  }
  return form;
}
