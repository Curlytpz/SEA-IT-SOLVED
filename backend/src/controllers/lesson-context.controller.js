const asyncHandler = require('../utils/asyncHandler');
const service = require('../services/lesson-context.service');

const get = asyncHandler(async (req, res) => res.json({ success: true, data: await service.get(req.params.lessonId, req.user.id) }));
const build = asyncHandler(async (req, res) => res.status(201).json({ success: true, data: await service.buildDraft(req.params.lessonId, req.user.id) }));
const save = asyncHandler(async (req, res) => {
  const context = await service.saveDraft(req.params.lessonId, req.user.id, req.body?.chunks);
  res.json({ success: true, data: { context } });
});
const approve = asyncHandler(async (req, res) => {
  const context = await service.approve(req.params.lessonId, req.user.id);
  res.json({ success: true, data: { context } });
});
const reopen = asyncHandler(async (req, res) => {
  const context = await service.reopen(req.params.lessonId, req.user.id);
  res.status(201).json({ success: true, data: { context } });
});

module.exports = { get, build, save, approve, reopen };
