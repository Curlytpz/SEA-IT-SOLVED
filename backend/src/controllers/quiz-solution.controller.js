const asyncHandler = require('../utils/asyncHandler');
const service = require('../services/quiz-solution.service');
const upload = asyncHandler(async (req, res) => res.status(201).json({ success: true, data: await service.uploadSolution(req.params.attemptId, req.params.questionId, req.user.id, req.file) }));
const list = asyncHandler(async (req, res) => res.json({ success: true, data: await service.listSolutions(req.params.quizId, req.user.id) }));
const recognize = asyncHandler(async (req, res) => res.json({ success: true, data: await service.recognize(req.params.answerId, req.user.id) }));
const analyze = asyncHandler(async (req, res) => res.json({ success: true, data: await service.analyze(req.params.answerId, req.user.id) }));
const grade = asyncHandler(async (req, res) => res.json({ success: true, data: await service.grade(req.params.answerId, req.user.id, req.body) }));
const image = asyncHandler(async (req, res) => {
  const file = await service.image(req.params.answerId, req.user);
  res.set({ 'Content-Type': file.mime, 'Content-Length': file.size, 'Cache-Control': 'private, no-store', 'Content-Disposition': 'inline', 'X-Content-Type-Options': 'nosniff' });
  file.stream.on('error', error => res.destroy(error));
  file.stream.pipe(res);
});
const attempts = asyncHandler(async (req,res) => res.json({success:true,data:await service.reviewAttempts(req.params.quizId,req.user.id)}));
const sectionReviews = asyncHandler(async (req,res) => res.json({success:true,data:await service.sectionReviews(req.params.sectionId,req.user.id)}));
const queue = asyncHandler(async (req,res) => res.json({success:true,data:await service.reviewQueue(req.user.id)}));
module.exports = { attempts, sectionReviews, queue, upload, list, recognize, analyze, grade, image };
