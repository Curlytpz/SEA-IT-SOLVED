const crypto = require('crypto');
const os = require('os');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const AppError = require('../utils/AppError');
const { MAX_AUDIO_BYTES, ALLOWED_AUDIO_MIME_TYPES, normalizeAudioMime } = require('../utils/audioFile');

const temporaryRoot = path.join(os.tmpdir(), 'sea-it-solved-audio-uploads');
fs.mkdirSync(temporaryRoot, { recursive: true });

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, callback) => callback(null, temporaryRoot),
    filename: (_req, _file, callback) => callback(null, crypto.randomUUID()),
  }),
  limits: { fileSize: MAX_AUDIO_BYTES, files: 1, fields: 16 },
  fileFilter: (_req, file, callback) => {
    if (!ALLOWED_AUDIO_MIME_TYPES.has(normalizeAudioMime(file.mimetype))) {
      return callback(new AppError('Audio recording must be WebM, Ogg, or WAV.', 400));
    }
    callback(null, true);
  },
});

module.exports = upload.single('audio');
