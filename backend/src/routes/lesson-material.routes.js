const router = require('express').Router();
const authenticate = require('../middleware/authenticate');
const { authorizeActive } = require('../middleware/authorize');
const upload = require('../middleware/lessonMaterialUpload');
const controller = require('../controllers/lesson-material.controller');

const guard = [authenticate, authorizeActive('INSTRUCTOR')];
router.post('/lessons/:lessonId/materials', ...guard, upload, controller.upload);
router.get('/lessons/:lessonId/materials', ...guard, controller.list);
router.get('/lesson-materials/:materialId/file', ...guard, controller.file);
router.post('/lesson-materials/:materialId/reprocess', ...guard, controller.reprocess);
router.delete('/lesson-materials/:materialId', ...guard, controller.remove);

module.exports = router;
