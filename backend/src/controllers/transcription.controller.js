const asyncHandler = require('../utils/asyncHandler');
const transcriptionService = require('../services/transcription.service');
const singleFlight = require('../utils/singleFlight');

const queue = asyncHandler(async (req, res) => {
  const result = await singleFlight.run(
    singleFlight.key(['lesson-transcription', req.user.id, req.params.lessonId]),
    () => transcriptionService.queueLessonTranscription(req.params.lessonId, req.user.id)
  );
  res.status(202).json({ success: true, data: result });
});

const reprocess = asyncHandler(async (req, res) => {
  const result = await singleFlight.run(
    singleFlight.key(['lesson-transcription', req.user.id, req.params.lessonId]),
    () => transcriptionService.queueLessonTranscription(req.params.lessonId, req.user.id, { reprocess: true })
  );
  res.status(202).json({ success: true, data: result });
});

const get = asyncHandler(async (req, res) => {
  const result = await transcriptionService.getLessonTranscription(req.params.lessonId, req.user.id);
  res.json({ success: true, data: result });
});

module.exports = { queue, reprocess, get };
