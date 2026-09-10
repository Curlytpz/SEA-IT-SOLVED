const AppError = require('../utils/AppError');

/**
 * authorize(...roles)
 *
 * Checks only that req.user.role is in the allowed list.
 * Use this for routes where PENDING status is acceptable
 * (e.g. the admin dashboard — admins are always ACTIVE, but the check
 * is explicit here).
 *
 * For any route that should be inaccessible to PENDING instructors,
 * use authorizeActive() instead.
 *
 * Must be called AFTER authenticate (which sets req.user).
 */
const authorize = (...roles) => (req, res, next) => {
  if (!req.user) {
    return next(new AppError('Authentication required.', 401));
  }
  if (!roles.includes(req.user.role)) {
    return next(new AppError(`Access denied. Required role: ${roles.join(' or ')}.`, 403));
  }
  next();
};

/**
 * authorizeActive(...roles)
 *
 * Checks BOTH role AND that the account status is ACTIVE.
 *
 * This is the correct guard for all instructor-facing endpoints.
 * A PENDING instructor has role=INSTRUCTOR but status=PENDING, so they
 * pass a plain authorize('INSTRUCTOR') check — that is the bug this
 * function fixes. authorizeActive('INSTRUCTOR') requires BOTH conditions.
 *
 * Why not handle this in authenticate?
 *   Because authenticate must allow PENDING instructors through for
 *   GET /api/auth/me so the frontend can read their status and display
 *   the "awaiting approval" screen. Active-status enforcement belongs
 *   at the resource-authorization layer, not the identity layer.
 *
 * Must be called AFTER authenticate.
 */
const authorizeActive = (...roles) => (req, res, next) => {
  if (!req.user) {
    return next(new AppError('Authentication required.', 401));
  }
  if (!roles.includes(req.user.role)) {
    return next(new AppError(`Access denied. Required role: ${roles.join(' or ')}.`, 403));
  }
  if (req.user.status !== 'ACTIVE') {
    // A PENDING instructor hits this. Return 403, not 401, because
    // the identity is valid — only the authorization is insufficient.
    return next(new AppError(
      'Your account is not yet active. Instructor accounts require administrator approval.',
      403
    ));
  }
  next();
};

module.exports = { authorize, authorizeActive };
