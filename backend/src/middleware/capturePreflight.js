const asyncHandler = require('../utils/asyncHandler');
const captureService = require('../services/capture.service');

module.exports = asyncHandler(async (req, _res, next) => {
  await captureService.assertCaptureAllowed(req.params.lessonId, req.user.id);
  next();
});
