const router       = require('express').Router();
const authCtrl     = require('../controllers/auth.controller');
const authenticate = require('../middleware/authenticate');
const { createRateLimiter } = require('../middleware/rateLimit');
const { AUTH_RATE_LIMIT_MAX } = require('../config/env');

const authAttemptLimiter = createRateLimiter({
  name: 'authentication-attempts',
  windowMs: 15 * 60 * 1000,
  max: AUTH_RATE_LIMIT_MAX,
  message: 'Too many authentication attempts. Try again later.',
});
const forgotPasswordLimiter = createRateLimiter({
  name: 'forgot-password',
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: 'Too many password reset requests. Try again later.',
});
const resetPasswordLimiter = createRateLimiter({
  name: 'reset-password',
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: 'Too many password reset attempts. Try again later.',
});

// Public routes — no authentication required
router.post('/register/student',    authAttemptLimiter, authCtrl.registerStudent);
router.post('/register/instructor', authAttemptLimiter, authCtrl.registerInstructor);
router.post('/login',               authAttemptLimiter, authCtrl.login);
router.post('/forgot-password', forgotPasswordLimiter, authCtrl.forgotPassword);
router.post('/reset-password/validate', resetPasswordLimiter, authCtrl.validateResetToken);
router.post('/reset-password', resetPasswordLimiter, authCtrl.resetPassword);

// Protected — requires a valid JWT and current server-side account access.
router.get('/me', authenticate, authCtrl.getMe);

module.exports = router;
