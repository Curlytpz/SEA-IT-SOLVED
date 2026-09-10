const multer = require('multer');
const AppError = require('../utils/AppError');
const { MAX_IMAGE_BYTES, ALLOWED_MIME_TYPES } = require('../utils/imageFile');

module.exports = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_IMAGE_BYTES, files: 1, fields: 2 },
  fileFilter: (_req, file, callback) => {
    if (!ALLOWED_MIME_TYPES.has(file.mimetype)) return callback(new AppError('Solution image must be JPEG, PNG, or WebP.', 400));
    callback(null, true);
  },
}).single('image');
