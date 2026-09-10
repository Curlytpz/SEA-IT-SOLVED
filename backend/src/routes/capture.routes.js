const router = require('express').Router();
const controller = require('../controllers/capture.controller');
const authenticate = require('../middleware/authenticate');
const { authorizeActive } = require('../middleware/authorize');
const captureUpload = require('../middleware/captureUpload');

const guard = [authenticate, authorizeActive('INSTRUCTOR')];

router.post('/lessons/:lessonId/captures', ...guard, captureUpload, controller.createCapture);
router.get('/lessons/:lessonId/captures', ...guard, controller.getCaptures);
router.get('/captures/:captureId/image/:variant', ...guard, controller.getCaptureImage);
router.delete('/captures/:captureId', ...guard, controller.deleteCapture);

module.exports = router;
