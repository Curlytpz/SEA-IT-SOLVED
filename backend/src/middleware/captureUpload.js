const multer = require('multer');
const AppError = require('../utils/AppError');
const { MAX_IMAGE_BYTES, ALLOWED_MIME_TYPES } = require('../utils/imageFile');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_IMAGE_BYTES, files: 14, fields: 16 },
  fileFilter: (_req, file, callback) => {
    if (!ALLOWED_MIME_TYPES.has(file.mimetype)) return callback(new AppError('Images must be JPEG, PNG, or WebP.', 400));
    callback(null, true);
  },
});

module.exports = upload.fields([
  { name: 'original', maxCount: 1 },
  { name: 'corrected', maxCount: 1 },
  { name: 'correctedPlanes', maxCount: 12 },
]);