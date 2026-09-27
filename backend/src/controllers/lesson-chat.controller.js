const asyncHandler = require('../utils/asyncHandler');
const service = require('../services/lesson-chat.service');
const singleFlight = require('../utils/singleFlight');

const list = asyncHandler(async (req, res) => res.json({
  success: true,
  data: await service.list(req.params.lessonId, req.user.id, req.query.conversationId),
}));
const send = asyncHandler(async (req, res) => res.status(201).json({
  success: true,
  data: await singleFlight.run(
    singleFlight.key(['lesson-chat', req.user.id, req.params.lessonId, req.body || {}]),
    () => service.send(req.params.lessonId, req.user.id, req.body || {})
  ),
}));
const generateQuiz = asyncHandler(async (req, res) => {
  const data = await singleFlight.run(
    singleFlight.key(['lesson-chat-quiz', req.user.id, req.params.lessonId, req.body || {}]),
    () => service.createQuiz(req.params.lessonId, req.user.id, req.body || {})
  );
  return res.status(data?.job ? 202 : 201).json({ success: true, data });
});

const getQuizGenerationJob = asyncHandler(async (req, res) => res.json({
  success: true,
  data: await service.getQuizGenerationJob(req.params.lessonId, req.user.id, req.params.jobId),
}));

const getActiveQuizGenerationJob = asyncHandler(async (req, res) => res.json({
  success: true,
  data: await service.getActiveQuizGenerationJob(req.params.lessonId, req.user.id),
}));

const undo = asyncHandler(async (req, res) => res.json({ success: true, data: await service.undo(req.params.lessonId, req.user.id, req.body || {}) }));
const remove = asyncHandler(async (req, res) => res.json({
  success: true,
  data: await service.deleteConversation(req.params.lessonId, req.user.id, req.params.conversationId),
}));

module.exports = { list, send, generateQuiz, getQuizGenerationJob, getActiveQuizGenerationJob, undo, remove };
