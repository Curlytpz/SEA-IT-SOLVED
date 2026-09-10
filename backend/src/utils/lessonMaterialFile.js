const AppError = require('./AppError');
const { detectImageMime } = require('./imageFile');

const IMAGE_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const PDF_MIME = 'application/pdf';

function detectMaterialMime(buffer) {
  const image = detectImageMime(buffer);
  if (image) return image;
  if (Buffer.isBuffer(buffer) && buffer.length >= 5 && buffer.toString('ascii', 0, 5) === '%PDF-') return PDF_MIME;
  return null;
}

function validateMaterialFile(file, { imageMaxMb, pdfMaxMb }) {
  if (!file?.buffer?.length) throw new AppError('Choose an image or PDF to upload.', 400);
  const detected = detectMaterialMime(file.buffer);
  if (!detected || detected !== file.mimetype) {
    throw new AppError('The file content does not match its declared image or PDF type.', 400);
  }
  const isPdf = detected === PDF_MIME;
  const limitMb = isPdf ? pdfMaxMb : imageMaxMb;
  if (file.size > limitMb * 1024 * 1024) {
    throw new AppError(`${isPdf ? 'PDF' : 'Image'} materials must be no larger than ${limitMb} MB.`, 400);
  }
  return { mimeType: detected, materialType: isPdf ? 'PDF' : 'IMAGE' };
}

module.exports = { IMAGE_MIMES, PDF_MIME, detectMaterialMime, validateMaterialFile };
