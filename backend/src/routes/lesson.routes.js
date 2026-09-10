const router       = require('express').Router();
const ctrl         = require('../controllers/lesson.controller');
const authenticate = require('../middleware/authenticate');
const { authorizeActive } = require('../middleware/authorize');

const guard = [authenticate, authorizeActive('INSTRUCTOR')];

router.post('/sections/:sectionId/lessons',  ...guard, ctrl.createLesson);
router.get('/sections/:sectionId/lessons',   ...guard, ctrl.getLessons);
router.get('/lessons/:lessonId',             ...guard, ctrl.getLessonById);
router.patch('/lessons/:lessonId',           ...guard, ctrl.updateLesson);
router.delete('/lessons/:lessonId',          ...guard, ctrl.deleteLesson);
router.patch('/lessons/:lessonId/start',     ...guard, ctrl.startLesson);
router.patch('/lessons/:lessonId/pause',     ...guard, ctrl.pauseLesson);
router.patch('/lessons/:lessonId/resume',    ...guard, ctrl.resumeLesson);
router.patch('/lessons/:lessonId/end',       ...guard, ctrl.endLesson);

module.exports = router;
