const router = require('express').Router();
const authenticate = require('../middleware/authenticate');
const { authorizeActive } = require('../middleware/authorize');
const controller = require('../controllers/lesson-chat.controller');
const guard = [authenticate, authorizeActive('INSTRUCTOR')];

router.get('/lessons/:lessonId/chat', ...guard, controller.list);
router.post('/lessons/:lessonId/chat/messages', ...guard, controller.send);
router.post('/lessons/:lessonId/chat/quiz', ...guard, controller.generateQuiz);
router.post('/lessons/:lessonId/chat/undo', ...guard, controller.undo);

module.exports = router;

