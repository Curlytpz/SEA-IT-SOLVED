const fs = require('fs/promises');
const AppError = require('./AppError');
const { AUDIO_MAX_UPLOAD_MB } = require('../config/env');

const MAX_AUDIO_BYTES = AUDIO_MAX_UPLOAD_MB * 1024 * 1024;
const ALLOWED_AUDIO_MIME_TYPES = new Set(['audio/webm', 'audio/ogg', 'audio/wav', 'audio/x-wav']);
const EXTENSIONS = { 'audio/webm': 'webm', 'audio/ogg': 'ogg', 'audio/wav': 'wav', 'audio/x-wav': 'wav' };

function normalizeAudioMime(mime) {
  return String(mime || '').split(';')[0].trim().toLowerCase();
}

function detectAudioMime(header) {
  if (!Buffer.isBuffer(header) || header.length < 12) return null;
  if (header.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]))) return 'audio/webm';
  if (header.toString('ascii', 0, 4) === 'OggS') return 'audio/ogg';
  if (header.toString('ascii', 0, 4) === 'RIFF' && header.toString('ascii', 8, 12) === 'WAVE') return 'audio/wav';
  return null;
}

async function validateAudioFile(file) {
  if (!file) throw new AppError('Audio recording file is required.', 400);
  if (!file.size || file.size > MAX_AUDIO_BYTES) {
    throw new AppError(`Audio recording must be no larger than ${AUDIO_MAX_UPLOAD_MB} MB.`, 400);
  }
  const declared = normalizeAudioMime(file.mimetype);
  if (!ALLOWED_AUDIO_MIME_TYPES.has(declared)) {
    throw new AppError('Audio recording must be WebM, Ogg, or WAV.', 400);
  }
  const handle = await fs.open(file.path, 'r');
  try {
    const header = Buffer.alloc(16);
    const { bytesRead } = await handle.read(header, 0, header.length, 0);
    const detected = detectAudioMime(header.subarray(0, bytesRead));
    const declaredNormalized = declared === 'audio/x-wav' ? 'audio/wav' : declared;
    if (!detected || detected !== declaredNormalized) {
      throw new AppError('Audio content does not match its declared file type.', 400);
    }
    return { mime: detected, extension: EXTENSIONS[detected] };
  } finally {
    await handle.close();
  }
}

async function removeTemporaryAudio(file) {
  if (file?.path) await fs.rm(file.path, { force: true }).catch(() => {});
}

module.exports = {
  MAX_AUDIO_BYTES,
  ALLOWED_AUDIO_MIME_TYPES,
  normalizeAudioMime,
  detectAudioMime,
  validateAudioFile,
  removeTemporaryAudio,
};
