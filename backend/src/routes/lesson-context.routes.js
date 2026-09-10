const router = require('express').Router();
const authenticate = require('../middleware/authenticate');
const { authorizeActive } = require('../middleware/authorize');
const controller = require('../controllers/lesson-context.controller');
const guard = [authenticate, authorizeActive('INSTRUCTOR')];

router.get('/lessons/:lessonId/context', ...guard, controller.get);
router.post('/lessons/:lessonId/context/draft', ...guard, controller.build);
router.put('/lessons/:lessonId/context/draft', ...guard, controller.save);
router.post('/lessons/:lessonId/context/approve', ...guard, controller.approve);
router.post('/lessons/:lessonId/context/reopen', ...guard, controller.reopen);

module.exports = router;
