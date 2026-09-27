const { RecognitionProviderError } = require('./ProviderErrorMapper');

const SUPPORTED_IMAGE_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

function hasExpectedSignature(buffer, mimeType) {
  if (mimeType === 'image/jpeg') return buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  if (mimeType === 'image/png') return buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]));
  if (mimeType === 'image/webp') return buffer.length >= 12 && buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP';
  return false;
}

function validateGeminiImage({ buffer, mimeType, maxBytes }) {
  const normalizedMime = String(mimeType || '').trim().toLowerCase();
  if (!SUPPORTED_IMAGE_MIME_TYPES.has(normalizedMime)) {
    throw new RecognitionProviderError('INVALID_INPUT', 'The capture image format is unsupported.', false);
  }
  if (!Buffer.isBuffer(buffer) || buffer.length === 0 || !hasExpectedSignature(buffer, normalizedMime)) {
    throw new RecognitionProviderError('INVALID_INPUT', 'The capture image is invalid.', false);
  }
  if (Number.isFinite(maxBytes) && maxBytes > 0 && buffer.length > maxBytes) {
    throw new RecognitionProviderError('INVALID_INPUT', 'The capture image is too large.', false);
  }
  return { buffer, mimeType: normalizedMime };
}

module.exports = { validateGeminiImage, SUPPORTED_IMAGE_MIME_TYPES };
