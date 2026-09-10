const asyncHandler = require('../utils/asyncHandler');
const recognitionService = require('../services/recognition.service');
const lessonRecognitionService = require('../services/lesson-recognition.service');
const lessonPipelineService = require('../services/lesson-pipeline.service');

const queueCapture = asyncHandler(async (req, res) => {
  const result = await recognitionService.queueCapture(req.params.captureId, req.user.id);
  res.status(202).json({ success: true, data: result });
});

const reprocessCapture = asyncHandler(async (req, res) => {
  const result = await recognitionService.queueCapture(req.params.captureId, req.user.id, { reprocess: true });
  res.status(202).json({ success: true, data: result });
});

const getCaptureRecognition = asyncHandler(async (req, res) => {
  const recognition = await recognitionService.getCaptureRecognition(req.params.captureId, req.user.id);
  res.json({ success: true, data: { recognition } });
});

const queueLesson = asyncHandler(async (req, res) => {
  const result = await lessonPipelineService.processCompleteLesson(req.params.lessonId, req.user.id);
  res.status(202).json({ success: true, data: result });
});

const getLessonRecognitions = asyncHandler(async (req, res) => {
  const [result, lessonRecognition] = await Promise.all([
    recognitionService.getLessonRecognitions(req.params.lessonId, req.user.id),
    lessonRecognitionService.getLesson(req.params.lessonId, req.user.id),
  ]);
  res.json({ success: true, data: { ...result, lessonRecognition } });
});

module.exports = { queueCapture, reprocessCapture, getCaptureRecognition, queueLesson, getLessonRecognitions };
