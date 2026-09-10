const router = require('express').Router();
const rateLimit = require('express-rate-limit');
const authenticate = require('../middleware/authenticate');
const { authorize, authorizeActive } = require('../middleware/authorize');
const upload = require('../middleware/solutionSubmissionUpload');
const controller = require('../controllers/solution-activity.controller');

const instructor = [authenticate, authorizeActive('INSTRUCTOR')];
const student = [authenticate, authorize('STUDENT')];
const analysisLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, max: 20, standardHeaders: true, legacyHeaders: false,
  message: { success: false, error: 'Too many solution-analysis requests. Please try again later.' },
});

router.get('/lessons/:lessonId/solution-activities', ...instructor, controller.listInstructor);
router.post('/lessons/:lessonId/solution-activities', ...instructor, controller.create);
router.put('/solution-activities/:activityId', ...instructor, controller.update);
router.post('/solution-activities/:activityId/publish', ...instructor, controller.publish);
router.post('/solution-activities/:activityId/close', ...instructor, controller.close);
router.post('/solution-activities/:activityId/reopen', ...instructor, controller.reopen);
router.delete('/solution-activities/:activityId', ...instructor, controller.remove);
router.get('/solution-activities/:activityId/submissions', ...instructor, controller.listSubmissions);
router.post('/solution-submissions/:submissionId/recognize', ...instructor, controller.recognize);
router.post('/solution-submissions/:submissionId/analyze', analysisLimiter, ...instructor, controller.analyze);
router.put('/solution-submissions/:submissionId/grade', ...instructor, controller.grade);
router.post('/solution-submissions/:submissionId/reopen', ...instructor, controller.reopenSubmission);

router.get('/student/lessons/:lessonId/solution-activities', ...student, controller.listStudent);
router.post('/student/solution-activities/:activityId/submission', ...student, upload, controller.submit);
router.get('/solution-submissions/:submissionId/image', authenticate, controller.image);

module.exports = router;
