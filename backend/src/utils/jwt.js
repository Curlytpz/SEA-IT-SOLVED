const jwt = require('jsonwebtoken');
const { JWT_SECRET, JWT_EXPIRES } = require('../config/env');

const VERIFICATION_SESSION_PURPOSE = 'EMAIL_VERIFICATION';
const VERIFICATION_SESSION_AUDIENCE = 'email-verification';
const VERIFICATION_SESSION_ISSUER = 'sea-it-solved';
const VERIFICATION_SESSION_EXPIRES = '10m';

/**
 * Sign a JWT payload.
 * Only include the minimum necessary claims — never include password_hash.
 */
function signToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES });
}

/**
 * Verify and decode a JWT.
 * Throws JsonWebTokenError or TokenExpiredError on failure.
 */
function verifyToken(token) {
  const decoded = jwt.verify(token, JWT_SECRET);
  if (decoded?.purpose || !decoded?.id || !decoded?.role) {
    throw new jwt.JsonWebTokenError('Invalid application token.');
  }
  return decoded;
}

function signVerificationSession({ userId, role, authVersion }) {
  return jwt.sign({
    sub: userId,
    role,
    authVersion: Number(authVersion) || 0,
    purpose: VERIFICATION_SESSION_PURPOSE,
  }, JWT_SECRET, {
    expiresIn: VERIFICATION_SESSION_EXPIRES,
    audience: VERIFICATION_SESSION_AUDIENCE,
    issuer: VERIFICATION_SESSION_ISSUER,
  });
}

function verifyVerificationSession(token) {
  const decoded = jwt.verify(token, JWT_SECRET, {
    audience: VERIFICATION_SESSION_AUDIENCE,
    issuer: VERIFICATION_SESSION_ISSUER,
  });
  if (decoded?.purpose !== VERIFICATION_SESSION_PURPOSE
      || !decoded?.sub
      || !['STUDENT', 'INSTRUCTOR'].includes(decoded?.role)) {
    throw new jwt.JsonWebTokenError('Invalid verification session.');
  }
  return decoded;
}

module.exports = {
  signToken,
  verifyToken,
  signVerificationSession,
  verifyVerificationSession,
  VERIFICATION_SESSION_EXPIRES,
};
