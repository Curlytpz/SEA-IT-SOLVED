const router = require('express').Router();
const { createRateLimiter } = require('../middleware/rateLimit');
const controller = require('../controllers/transcription.controller');
const authenticate = require('../middleware/authenticate');
const { authorizeActive } = require('../middleware/authorize');

const guard = [authenticate, authorizeActive('INSTRUCTOR')];
const readLimiter = createRateLimiter({
  name: 'transcription-status',
  windowMs: 15 * 60 * 1000,
  max: 300,
  message: 'Transcript status is being refreshed too frequently. Please wait a moment.',
});

router.post('/lessons/:lessonId/transcription', ...guard, controller.queue);
router.post('/lessons/:lessonId/transcription/reprocess', ...guard, controller.reprocess);
router.get('/lessons/:lessonId/transcription', ...guard, readLimiter, controller.get);

module.exports = router;
