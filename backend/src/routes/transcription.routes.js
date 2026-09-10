const router = require('express').Router();
const rateLimit = require('express-rate-limit');
const controller = require('../controllers/transcription.controller');
const authenticate = require('../middleware/authenticate');
const { authorizeActive } = require('../middleware/authorize');

const guard = [authenticate, authorizeActive('INSTRUCTOR')];
const readLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Transcript status is being refreshed too frequently. Please wait a moment.' },
});

router.post('/lessons/:lessonId/transcription', ...guard, controller.queue);
router.post('/lessons/:lessonId/transcription/reprocess', ...guard, controller.reprocess);
router.get('/lessons/:lessonId/transcription', ...guard, readLimiter, controller.get);

module.exports = router;
