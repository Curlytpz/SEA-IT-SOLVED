const asyncHandler = require('../utils/asyncHandler');
const settingsService = require('../services/hardware-settings.service');
const calibrationService = require('../services/calibration.service');

const getSettings = asyncHandler(async (req, res) => {
  const settings = await settingsService.getSettings(req.user.id);
  res.json({ success: true, data: { settings } });
});

const updateSettings = asyncHandler(async (req, res) => {
  const settings = await settingsService.updateSettings(req.user.id, req.body);
  res.json({ success: true, data: { settings } });
});

const getCalibrations = asyncHandler(async (req, res) => {
  const calibrations = await calibrationService.getCalibrations(req.user.id);
  res.set('Cache-Control', 'private, no-store, max-age=0');
  res.json({ success: true, data: { calibrations } });
});

const getCalibration = asyncHandler(async (req, res) => {
  const calibration = await calibrationService.getCalibration(req.user.id, req.params.sourceKey);
  res.set('Cache-Control', 'private, no-store, max-age=0');
  res.json({ success: true, data: { calibration } });
});

const saveCalibration = asyncHandler(async (req, res) => {
  const calibration = await calibrationService.saveCalibration(req.user.id, req.body);
  res.set('Cache-Control', 'private, no-store, max-age=0');
  res.json({ success: true, data: { calibration } });
});

const deleteCalibration = asyncHandler(async (req, res) => {
  await calibrationService.deleteCalibration(req.params.calibrationId, req.user.id);
  res.json({ success: true, data: { message: 'Calibration reset.' } });
});

module.exports = { getSettings, updateSettings, getCalibrations, getCalibration, saveCalibration, deleteCalibration };
