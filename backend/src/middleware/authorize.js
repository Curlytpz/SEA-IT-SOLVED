const AppError = require('../utils/AppError');

/**
 * authorize(...roles)
 *
 * Checks only that req.user.role is in the allowed list.
 * Use this for routes that need only a role check after authenticate.
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
 * authorizeActive('INSTRUCTOR') requires BOTH role and current ACTIVE status.
 * authenticate also rejects pending instructors for /auth/me and mixed-role
 * endpoints; this check remains a resource-level defense.
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
