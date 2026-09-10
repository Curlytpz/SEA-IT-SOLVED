const router       = require('express').Router();
const authCtrl     = require('../controllers/auth.controller');
const authenticate = require('../middleware/authenticate');
const rateLimit = require('express-rate-limit');

const forgotPasswordLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Too many password reset requests. Try again later.' },
});
const resetPasswordLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Too many password reset attempts. Try again later.' },
});

// Public routes — no authentication required
router.post('/register/student',    authCtrl.registerStudent);
router.post('/register/instructor', authCtrl.registerInstructor);
router.post('/login',               authCtrl.login);
router.post('/forgot-password', forgotPasswordLimiter, authCtrl.forgotPassword);
router.post('/reset-password/validate', resetPasswordLimiter, authCtrl.validateResetToken);
router.post('/reset-password', resetPasswordLimiter, authCtrl.resetPassword);

// Protected — requires valid JWT.
// authenticate allows PENDING instructors through here so the frontend
// can read user.status and show the "awaiting approval" screen.
router.get('/me', authenticate, authCtrl.getMe);

module.exports = router;
