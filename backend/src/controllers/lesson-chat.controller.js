const asyncHandler = require('../utils/asyncHandler');
const service = require('../services/lesson-chat.service');

const list = asyncHandler(async (req, res) => res.json({
  success: true,
  data: await service.list(req.params.lessonId, req.user.id),
}));
const send = asyncHandler(async (req, res) => res.status(201).json({
  success: true,
  data: await service.send(req.params.lessonId, req.user.id, req.body || {}),
}));
const generateQuiz = asyncHandler(async (req, res) => res.status(201).json({
  success: true,
  data: await service.createQuiz(req.params.lessonId, req.user.id, req.body || {}),
}));

const undo = asyncHandler(async (req, res) => res.json({ success: true, data: await service.undo(req.params.lessonId, req.user.id) }));

module.exports = { list, send, generateQuiz, undo };

