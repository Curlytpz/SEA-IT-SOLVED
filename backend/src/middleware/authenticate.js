const { verifyToken } = require('../utils/jwt');
const pool = require('../db/pool');
const AppError = require('../utils/AppError');
const asyncHandler = require('../utils/asyncHandler');

/**
 * authenticate
 *
 * Reads the Bearer token from the Authorization header,
 * verifies it, and fetches a fresh copy of the user row from the DB
 * on every single request. This means:
 *
 *   - PENDING instructors, SUSPENDED accounts, and REJECTED accounts are
 *     blocked immediately (no stale JWT window)
 *   - Role or status changes made by the admin are reflected on the very
 *     next request — no re-login required
 *
 * What this middleware does NOT do:
 *   - It does not enforce role requirements (use authorize / authorizeActive)
 *   - It does not require status=ACTIVE for every role; instructor approval
 *     is enforced here even for /auth/me and mixed-role endpoints
 */
const authenticate = asyncHandler(async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new AppError('Authentication required. Provide a Bearer token.', 401);
  }

  const token = authHeader.slice(7); // strip "Bearer "

  let decoded;
  try {
    decoded = verifyToken(token);
  } catch {
    throw new AppError('Invalid or expired token.', 401);
  }

  // Always fetch from DB — never rely solely on JWT claims
  const { rows } = await pool.query(
    'SELECT id, first_name, last_name, email, role, status, auth_version FROM users WHERE id = $1',
    [decoded.id]
  );

  if (rows.length === 0) {
    throw new AppError('User not found.', 401);
  }

  const user = rows[0];

  // Block hard-stopped accounts at the authentication layer
  if (user.role === 'INSTRUCTOR' && user.status === 'PENDING') {
    throw new AppError('Your instructor account is awaiting admin approval.', 403, { code: 'INSTRUCTOR_PENDING' });
  }
  if (user.role === 'STUDENT' && user.status === 'PENDING') {
    throw new AppError('Verify your student email before accessing student features.', 403, { code: 'STUDENT_EMAIL_UNVERIFIED' });
  }
  if (user.status === 'SUSPENDED') {
    throw new AppError('Your account has been suspended. Contact the administrator.', 403, {
      code: user.role === 'INSTRUCTOR' ? 'INSTRUCTOR_SUSPENDED' : undefined,
    });
  }
  if (user.status === 'REJECTED') {
    throw user.role === 'INSTRUCTOR'
      ? new AppError('Your instructor account was not approved.', 403, { code: 'INSTRUCTOR_REJECTED' })
      : new AppError('Your account has been rejected. Contact the administrator.', 403);
  }
  if (user.role === 'INSTRUCTOR' && user.status !== 'ACTIVE') {
    throw new AppError('Your instructor account is not available. Please contact the administrator.', 403, { code: 'INSTRUCTOR_SUSPENDED' });
  }
  if (Number(decoded.authVersion || 0) !== Number(user.auth_version || 0)) {
    throw new AppError('Invalid or expired token.', 401);
  }

  req.user = user;
  next();
});

module.exports = authenticate;
