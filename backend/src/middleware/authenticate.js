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
 *   - SUSPENDED accounts are blocked immediately (no stale JWT window)
 *   - REJECTED accounts are blocked immediately
 *   - Role or status changes made by the admin are reflected on the very
 *     next request — no re-login required
 *
 * What this middleware does NOT do:
 *   - It does not enforce role requirements (use authorize / authorizeActive)
 *   - It does not require status=ACTIVE (a PENDING instructor may call /auth/me
 *     so the frontend can show the "awaiting approval" screen)
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

  if (Number(decoded.authVersion || 0) !== Number(user.auth_version || 0)) {
    throw new AppError('Invalid or expired token.', 401);
  }

  // Block hard-stopped accounts at the authentication layer
  if (user.status === 'SUSPENDED') {
    throw new AppError('Your account has been suspended. Contact the administrator.', 403);
  }
  if (user.status === 'REJECTED') {
    throw new AppError('Your account has been rejected. Contact the administrator.', 403);
  }

  req.user = user;
  next();
});

module.exports = authenticate;
