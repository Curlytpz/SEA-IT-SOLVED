const asyncHandler = require('../utils/asyncHandler');
const service = require('../services/lesson-intelligence.service');

const list = asyncHandler(async (req, res) => res.json({ success: true, data: await service.list(req.params.lessonId, req.user.id) }));
const generateMaterials = asyncHandler(async (req, res) => res.status(201).json({ success: true, data: { materials: await service.generateMaterials(req.params.lessonId, req.user.id) } }));
const publishMaterials = asyncHandler(async (req, res) => res.json({ success: true, data: { materials: await service.publishMaterials(req.params.lessonId, req.user.id) } }));
const generateQuiz = asyncHandler(async (req, res) => res.status(201).json({ success: true, data: { quiz: await service.generateQuiz(req.params.lessonId, req.user.id, req.body || {}) } }));
const updateQuiz = asyncHandler(async (req, res) => res.json({ success: true, data: { quiz: await service.updateQuiz(req.params.quizId, req.user.id, req.body || {}) } }));
const updateQuestion = asyncHandler(async (req, res) => res.json({ success: true, data: { question: await service.updateQuestion(req.params.quizId, req.params.questionId, req.user.id, req.body || {}) } }));
const deleteQuestion = asyncHandler(async (req, res) => { await service.deleteQuestion(req.params.quizId, req.params.questionId, req.user.id); res.json({ success: true }); });
const publishQuiz = asyncHandler(async (req, res) => res.json({ success: true, data: { quiz: await service.publishQuiz(req.params.quizId, req.user.id) } }));
const closeQuiz = asyncHandler(async (req, res) => res.json({ success: true, data: { quiz: await service.closeQuiz(req.params.quizId, req.user.id) } }));
const setQuizStatus = asyncHandler(async (req, res) => res.json({ success: true, data: { quiz: await service.setQuizStatus(req.params.quizId, req.user.id, req.body?.status) } }));
const deleteQuiz = asyncHandler(async (req, res) => res.json({
  success: true,
  data: { quiz: await service.deleteQuiz(req.params.quizId, req.user.id, { force: req.query.force === 'true' }) },
}));

module.exports = { list, generateMaterials, publishMaterials, generateQuiz, updateQuiz, updateQuestion, deleteQuestion, publishQuiz, closeQuiz, setQuizStatus, deleteQuiz };
