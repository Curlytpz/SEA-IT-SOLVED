const asyncHandler = require('../utils/asyncHandler');
const captureService = require('../services/capture.service');

const createCapture = asyncHandler(async (req, res) => {
  const capture = await captureService.createCapture(req.params.lessonId, req.user.id, req.files, req.body);
  res.status(201).json({ success: true, data: { capture } });
});

const getCaptures = asyncHandler(async (req, res) => {
  const captures = await captureService.getCaptures(req.params.lessonId, req.user.id);
  res.json({ success: true, data: { captures } });
});

const getCaptureImage = asyncHandler(async (req, res) => {
  const file = await captureService.getCaptureFile(req.params.captureId, req.user.id, req.params.variant);
  res.setHeader('Content-Type', file.mime);
  res.setHeader('Content-Length', file.size);
  res.setHeader('Cache-Control', 'private, max-age=300');
  res.setHeader('Content-Disposition', 'inline');
  file.stream.on('error', err => res.destroy(err));
  file.stream.pipe(res);
});

const deleteCapture = asyncHandler(async (req, res) => {
  await captureService.deleteCapture(req.params.captureId, req.user.id);
  res.json({ success: true, data: { message: 'Capture deleted.' } });
});

module.exports = { createCapture, getCaptures, getCaptureImage, deleteCapture };
