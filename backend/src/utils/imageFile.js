const AppError = require('./AppError');

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

function detectImageMime(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 12) return null;
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg';
  if (buffer.subarray(0, 8).equals(Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]))) return 'image/png';
  if (buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  return null;
}

function validateImageFile(file, label) {
  if (!file) throw new AppError(`${label} image is required.`, 400);
  if (file.size <= 0 || file.size > MAX_IMAGE_BYTES) {
    throw new AppError(`${label} image must be no larger than 8 MB.`, 400);
  }
  if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
    throw new AppError(`${label} image must be JPEG, PNG, or WebP.`, 400);
  }
  const detected = detectImageMime(file.buffer);
  if (!detected || detected !== file.mimetype) {
    throw new AppError(`${label} image content does not match its declared file type.`, 400);
  }
  return detected;
}

module.exports = { MAX_IMAGE_BYTES, ALLOWED_MIME_TYPES, detectImageMime, validateImageFile };
