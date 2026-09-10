const multer = require('multer');
const AppError = require('../utils/AppError');
const { IMAGE_MIMES, PDF_MIME } = require('../utils/lessonMaterialFile');
const { LESSON_MATERIAL_IMAGE_MAX_MB, LESSON_MATERIAL_PDF_MAX_MB } = require('../config/env');

module.exports = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: Math.max(LESSON_MATERIAL_IMAGE_MAX_MB, LESSON_MATERIAL_PDF_MAX_MB) * 1024 * 1024,
    files: 1,
    fields: 2,
  },
  fileFilter: (_req, file, callback) => {
    if (!IMAGE_MIMES.has(file.mimetype) && file.mimetype !== PDF_MIME) {
      return callback(new AppError('Lesson materials must be JPG, JPEG, PNG, WebP, or PDF.', 400));
    }
    callback(null, true);
  },
}).single('file');
