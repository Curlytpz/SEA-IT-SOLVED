const router = require('express').Router();
const rateLimit = require('express-rate-limit');
const controller = require('../controllers/recognition.controller');
const authenticate = require('../middleware/authenticate');
const { authorizeActive } = require('../middleware/authorize');

const guard = [authenticate, authorizeActive('INSTRUCTOR')];
const recognitionReadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Recognition status is being refreshed too frequently. Please wait a moment.' },
});


router.post('/captures/:captureId/recognition', ...guard, controller.queueCapture);
router.post('/captures/:captureId/recognition/reprocess', ...guard, controller.reprocessCapture);
router.get('/captures/:captureId/recognition', ...guard, recognitionReadLimiter, controller.getCaptureRecognition);
router.post('/lessons/:lessonId/recognitions', ...guard, controller.queueLesson);
router.get('/lessons/:lessonId/recognitions', ...guard, recognitionReadLimiter, controller.getLessonRecognitions);

module.exports = router;
