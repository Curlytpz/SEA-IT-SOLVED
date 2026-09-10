const asyncHandler = require('../utils/asyncHandler');
const service = require('../services/lesson-material.service');

const upload = asyncHandler(async (req, res) => {
  const material = await service.upload(req.params.lessonId, req.user.id, req.file);
  res.status(201).json({ success: true, data: { material } });
});
const list = asyncHandler(async (req, res) => {
  const materials = await service.list(req.params.lessonId, req.user.id);
  res.json({ success: true, data: { materials } });
});
const file = asyncHandler(async (req, res) => {
  const opened = await service.openFile(req.params.materialId, req.user.id);
  res.setHeader('Content-Type', opened.mime);
  res.setHeader('Content-Length', opened.size);
  res.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(opened.filename)}`);
  res.setHeader('Cache-Control', 'private, max-age=300');
  opened.stream.on('error', error => res.destroy(error));
  opened.stream.pipe(res);
});
const remove = asyncHandler(async (req, res) => {
  await service.remove(req.params.materialId, req.user.id);
  res.json({ success: true, data: { message: 'Lesson material deleted.' } });
});
const reprocess = asyncHandler(async (req, res) => {
  const result = await service.reprocess(req.params.materialId, req.user.id);
  res.status(202).json({ success: true, data: result });
});

module.exports = { upload, list, file, remove, reprocess };
