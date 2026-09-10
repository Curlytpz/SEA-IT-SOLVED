const asyncHandler = require('../utils/asyncHandler');
const authService  = require('../services/auth.service');
const passwordResetService = require('../services/password-reset.service');

const registerStudent = asyncHandler(async (req, res) => {
  const { firstName, lastName, email, studentNumber, password } = req.body;
  const result = await authService.registerStudent({ firstName, lastName, email, studentNumber, password });
  res.status(201).json({ success: true, data: result });
});

const registerInstructor = asyncHandler(async (req, res) => {
  const { firstName, lastName, email, password } = req.body;
  const result = await authService.registerInstructor({ firstName, lastName, email, password });
  res.status(201).json({ success: true, data: result });
});

const login = asyncHandler(async (req, res) => {
  const { email, password, expectedRole } = req.body;
  const result = await authService.login({ email, password, expectedRole });
  res.status(200).json({ success: true, data: result });
});

const getMe = asyncHandler(async (req, res) => {
  const user = await authService.getMe(req.user.id);
  res.status(200).json({ success: true, data: { user } });
});

const forgotPassword = asyncHandler(async (req, res) => {
  const result = await passwordResetService.requestPasswordReset({ email: req.body.email, role: req.body.role });
  res.status(200).json({ success: true, data: result });
});

const validateResetToken = asyncHandler(async (req, res) => {
  const result = await passwordResetService.validateResetToken({ token: req.body.token });
  res.status(200).json({ success: true, data: result });
});

const resetPassword = asyncHandler(async (req, res) => {
  const result = await passwordResetService.resetPassword({ token: req.body.token, password: req.body.password });
  res.status(200).json({ success: true, data: result });
});

module.exports = { registerStudent, registerInstructor, login, getMe, forgotPassword, validateResetToken, resetPassword };
