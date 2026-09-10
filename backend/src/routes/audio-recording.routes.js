const router = require('express').Router();
const controller = require('../controllers/audio-recording.controller');
const authenticate = require('../middleware/authenticate');
const { authorizeActive } = require('../middleware/authorize');
const audioUpload = require('../middleware/audioUpload');

const guard = [authenticate, authorizeActive('INSTRUCTOR')];

router.post('/lessons/:lessonId/audio-recording', ...guard, audioUpload, controller.createRecording);
router.get('/lessons/:lessonId/audio-recording', ...guard, controller.getLessonRecording);
router.get('/sections/:sectionId/audio-recordings', ...guard, controller.getSectionRecordings);
router.get('/audio-recordings/:recordingId/audio', ...guard, controller.getRecordingAudio);
router.delete('/audio-recordings/:recordingId', ...guard, controller.deleteRecording);

module.exports = router;
