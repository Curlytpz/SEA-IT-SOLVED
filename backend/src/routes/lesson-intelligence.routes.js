const router = require('express').Router();
const authenticate = require('../middleware/authenticate');
const { authorizeActive } = require('../middleware/authorize');
const controller = require('../controllers/lesson-intelligence.controller');
const guard = [authenticate, authorizeActive('INSTRUCTOR')];

router.get('/lessons/:lessonId/intelligence', ...guard, controller.list);
router.post('/lessons/:lessonId/intelligence/materials', ...guard, controller.generateMaterials);
router.post('/lessons/:lessonId/intelligence/materials/publish', ...guard, controller.publishMaterials);
router.post('/lessons/:lessonId/intelligence/quiz', ...guard, controller.generateQuiz);
router.put('/quizzes/:quizId', ...guard, controller.updateQuiz);
router.put('/quizzes/:quizId/questions/:questionId', ...guard, controller.updateQuestion);
router.delete('/quizzes/:quizId/questions/:questionId', ...guard, controller.deleteQuestion);
router.post('/quizzes/:quizId/publish', ...guard, controller.publishQuiz);
router.post('/quizzes/:quizId/close', ...guard, controller.closeQuiz);
router.patch('/quizzes/:quizId/status', ...guard, controller.setQuizStatus);
router.delete('/quizzes/:quizId', ...guard, controller.deleteQuiz);

module.exports = router;
