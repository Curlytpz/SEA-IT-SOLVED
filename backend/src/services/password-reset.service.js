const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const pool = require('../db/pool');
const config = require('../config/env');
const emailService = require('./email.service');
const AppError = require('../utils/AppError');

const SALT_ROUNDS = 12;
const PUBLIC_REQUEST_MESSAGE = 'If an account exists for that email, password reset instructions have been sent.';
const INVALID_TOKEN_MESSAGE = 'This password reset link is invalid or has expired.';
const RESET_SUCCESS_MESSAGE = 'Your password has been changed successfully.';

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase().slice(0, 255);
}

function validatePassword(password) {
  if (typeof password !== 'string' || password.length < 8) {
    throw new AppError('Password must be at least 8 characters.', 400);
  }
}

function hashResetToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function validTokenShape(token) {
  return typeof token === 'string' && /^[a-f0-9]{64}$/i.test(token);
}

async function requestPasswordReset({ email, role }) {
  console.info('[PasswordReset] Request received');
  const normalizedEmail = normalizeEmail(email);
  const normalizedRole = ['STUDENT', 'INSTRUCTOR'].includes(String(role || '').toUpperCase()) ? String(role).toUpperCase() : null;
  if (!normalizedEmail || !normalizedEmail.includes('@')) {
    console.info('[PasswordReset] Registered account found: NO');
    console.info('[PasswordReset] Calling email service: NO');
    return { message: PUBLIC_REQUEST_MESSAGE };
  }
  if (normalizedRole === 'STUDENT' && !normalizedEmail.endsWith(`@${config.STUDENT_EMAIL_DOMAIN}`)) {
    console.info('[PasswordReset] Registered account found: NO');
    console.info('[PasswordReset] Calling email service: NO');
    return { message: PUBLIC_REQUEST_MESSAGE };
  }
  if (normalizedRole === 'INSTRUCTOR' && config.INSTRUCTOR_EMAIL_DOMAIN && !normalizedEmail.endsWith(`@${config.INSTRUCTOR_EMAIL_DOMAIN}`)) {
    console.info('[PasswordReset] Registered account found: NO');
    console.info('[PasswordReset] Calling email service: NO');
    return { message: PUBLIC_REQUEST_MESSAGE };
  }

  const client = await pool.connect();
  let user = null;
  let rawToken = '';
  let expiresAt = null;
  try {
    await client.query('BEGIN');
    const result = await client.query(
      `SELECT id,email,role FROM users
       WHERE LOWER(email)=$1 AND role IN ('STUDENT','INSTRUCTOR')
         AND ($2::text IS NULL OR role::text=$2)
       FOR UPDATE`,
      [normalizedEmail, normalizedRole]
    );
    user = result.rows[0] || null;
    if (user) {
      await client.query(
        'UPDATE password_reset_tokens SET used_at=NOW() WHERE user_id=$1 AND used_at IS NULL',
        [user.id]
      );
      rawToken = crypto.randomBytes(32).toString('hex');
      expiresAt = new Date(Date.now() + config.PASSWORD_RESET_TTL_MINUTES * 60 * 1000);
      await client.query(
        `INSERT INTO password_reset_tokens(user_id,token_hash,expires_at)
         VALUES($1,$2,$3)`,
        [user.id, hashResetToken(rawToken), expiresAt]
      );
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }

  console.info(`[PasswordReset] Registered account found: ${user ? 'YES' : 'NO'}`);
  if (user) {
    console.info('[PasswordReset] Reset token record created: YES');
    const resetUrl = `${config.FRONTEND_URL.replace(/\/$/, '')}/reset-password?token=${encodeURIComponent(rawToken)}`;
    try {
      console.info('[PasswordReset] Calling email service: YES');
      await emailService.sendPasswordResetEmail({
        email: user.email,
        resetUrl,
        expiresInMinutes: config.PASSWORD_RESET_TTL_MINUTES,
      });
    } catch (error) {
      // Keep the public response generic. Do not reveal account existence or raw tokens.
      const safeName = String(error?.name || 'Error').replace(/[^A-Za-z0-9_.-]/g, '').slice(0, 80) || 'Error';
      const status = Number(error?.statusCode ?? error?.status);
      console.error(`[PasswordReset] Email service error name: ${safeName}`);
      console.error(`[PasswordReset] Email service error status: ${Number.isInteger(status) ? status : 'UNKNOWN'}`);
      console.error('[PasswordReset] Email service error message: Provider request failed.');
    }
  } else {
    console.info('[PasswordReset] Calling email service: NO');
  }
  return { message: PUBLIC_REQUEST_MESSAGE };
}

async function validateResetToken({ token }) {
  if (!validTokenShape(token)) throw new AppError(INVALID_TOKEN_MESSAGE, 400);
  const { rows } = await pool.query(
    `SELECT 1 FROM password_reset_tokens
     WHERE token_hash=$1 AND used_at IS NULL AND expires_at>NOW()
     LIMIT 1`,
    [hashResetToken(token)]
  );
  if (!rows.length) throw new AppError(INVALID_TOKEN_MESSAGE, 400);
  return { valid: true };
}

async function resetPassword({ token, password }) {
  validatePassword(password);
  if (!validTokenShape(token)) throw new AppError(INVALID_TOKEN_MESSAGE, 400);
  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
  const tokenHash = hashResetToken(token);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query(
      `SELECT reset.user_id
       FROM password_reset_tokens reset
       JOIN users account ON account.id=reset.user_id
       WHERE reset.token_hash=$1 AND reset.used_at IS NULL AND reset.expires_at>NOW()
       FOR UPDATE OF reset,account`,
      [tokenHash]
    );
    if (!result.rows.length) throw new AppError(INVALID_TOKEN_MESSAGE, 400);
    const userId = result.rows[0].user_id;
    await client.query(
      'UPDATE users SET password_hash=$2,auth_version=auth_version+1 WHERE id=$1',
      [userId, passwordHash]
    );
    await client.query(
      'UPDATE password_reset_tokens SET used_at=NOW() WHERE user_id=$1 AND used_at IS NULL',
      [userId]
    );
    await client.query('COMMIT');
    return { message: RESET_SUCCESS_MESSAGE };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

module.exports = {
  requestPasswordReset,
  validateResetToken,
  resetPassword,
  validatePassword,
  hashResetToken,
  PUBLIC_REQUEST_MESSAGE,
  INVALID_TOKEN_MESSAGE,
};
