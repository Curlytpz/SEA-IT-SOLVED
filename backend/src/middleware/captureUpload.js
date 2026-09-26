const multer = require('multer');
const AppError = require('../utils/AppError');
const { MAX_IMAGE_BYTES, ALLOWED_MIME_TYPES } = require('../utils/imageFile');
const {
  CAPTURE_MAX_AGGREGATE_MB,
  CAPTURE_MAX_CONCURRENT_UPLOADS,
  CAPTURE_MAX_CONCURRENT_PER_USER,
} = require('../config/env');

const MAX_AGGREGATE_BYTES = CAPTURE_MAX_AGGREGATE_MB * 1024 * 1024;
const REQUEST_OVERHEAD_BYTES = 1024 * 1024;
const aggregateBytes = Symbol('captureAggregateBytes');
let activeUploads = 0;
const activeByUser = new Map();

function boundedMemoryStorage() {
  return {
    _handleFile(req, file, callback) {
      const chunks = [];
      let size = 0;
      let settled = false;
      function fail(error) {
        if (settled) return;
        settled = true;
        file.stream.resume();
        callback(error);
      }
      file.stream.on('data', chunk => {
        size += chunk.length;
        req[aggregateBytes] = (req[aggregateBytes] || 0) + chunk.length;
        if (req[aggregateBytes] > MAX_AGGREGATE_BYTES) {
          fail(new AppError(`Capture uploads may contain at most ${CAPTURE_MAX_AGGREGATE_MB} MB in total.`, 413));
          return;
        }
        chunks.push(chunk);
      });
      file.stream.on('error', fail);
      file.stream.on('end', () => {
        if (settled) return;
        settled = true;
        callback(null, { buffer: Buffer.concat(chunks, size), size });
      });
    },
    _removeFile(_req, file, callback) {
      delete file.buffer;
      callback(null);
    },
  };
}

const parser = multer({
  storage: boundedMemoryStorage(),
  limits: {
    fileSize: MAX_IMAGE_BYTES,
    files: 14,
    fields: 16,
    fieldSize: 64 * 1024,
    fieldNestingDepth: 2,
    fieldArrayIndexLimit: 100,
  },
  fileFilter: (_req, file, callback) => {
    if (!ALLOWED_MIME_TYPES.has(file.mimetype)) return callback(new AppError('Images must be JPEG, PNG, or WebP.', 400));
    callback(null, true);
  },
}).fields([
  { name: 'original', maxCount: 1 },
  { name: 'corrected', maxCount: 1 },
  { name: 'correctedPlanes', maxCount: 12 },
]);

module.exports = function captureUpload(req, res, next) {
  const userId = String(req.user?.id || 'anonymous');
  const declaredLength = Number(req.headers['content-length']);
  if (Number.isFinite(declaredLength) && declaredLength > MAX_AGGREGATE_BYTES + REQUEST_OVERHEAD_BYTES) {
    return next(new AppError(`Capture uploads may contain at most ${CAPTURE_MAX_AGGREGATE_MB} MB in total.`, 413));
  }
  if (activeUploads >= CAPTURE_MAX_CONCURRENT_UPLOADS) {
    return next(new AppError('The capture service is busy. Try again shortly.', 429));
  }
  if ((activeByUser.get(userId) || 0) >= CAPTURE_MAX_CONCURRENT_PER_USER) {
    return next(new AppError('Another capture upload is already in progress.', 429));
  }

  activeUploads += 1;
  activeByUser.set(userId, (activeByUser.get(userId) || 0) + 1);
  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    activeUploads = Math.max(0, activeUploads - 1);
    const remaining = Math.max(0, (activeByUser.get(userId) || 1) - 1);
    if (remaining) activeByUser.set(userId, remaining); else activeByUser.delete(userId);
  };
  res.once('finish', release);
  req.releaseCaptureUpload = release;
  req[aggregateBytes] = 0;
  parser(req, res, error => {
    if (error) release();
    next(error);
  });
};

module.exports._state = () => ({ activeUploads, activeByUser: new Map(activeByUser) });
