const crypto = require('crypto');
const pool = require('../db/pool');
const config = require('../config/env');
const emailService = require('./email.service');
const AppError = require('../utils/AppError');

const PUBLIC_RESEND_MESSAGE = 'If an unverified student account exists for that email, a verification link has been sent.';
const INVALID_TOKEN_MESSAGE = 'This email verification link is invalid or has expired.';
const VERIFIED_MESSAGE = 'Your student email has been verified. You can now sign in.';

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase().slice(0, 255);
}

function hashVerificationToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function validTokenShape(token) {
  return typeof token === 'string' && /^[a-f0-9]{64}$/i.test(token);
}

async function createToken(client, userId) {
  const rawToken = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + config.EMAIL_VERIFICATION_TTL_MINUTES * 60 * 1000);
  await client.query(
    `INSERT INTO email_verification_tokens(user_id, token_hash, expires_at)
     VALUES($1, $2, $3)`,
    [userId, hashVerificationToken(rawToken), expiresAt]
  );
  return { rawToken, expiresAt };
}

async function deliverVerification({ email, rawToken }) {
  const verificationUrl = `${config.FRONTEND_URL.replace(/\/$/, '')}/verify-email?token=${encodeURIComponent(rawToken)}`;
  return emailService.sendStudentVerificationEmail({
    email,
    verificationUrl,
    expiresInMinutes: config.EMAIL_VERIFICATION_TTL_MINUTES,
  });
}

function logSafeDeliveryFailure(error) {
  const safeName = String(error?.name || 'Error').replace(/[^A-Za-z0-9_.-]/g, '').slice(0, 80) || 'Error';
  const status = Number(error?.statusCode ?? error?.status);
  console.error(`[EmailVerification] Delivery failed name=${safeName} status=${Number.isInteger(status) ? status : 'UNKNOWN'}`);
}

async function issueForNewStudent(client, user) {
  const token = await createToken(client, user.id);
  return { email: user.email, rawToken: token.rawToken };
}

async function resendVerification({ email }) {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail || !normalizedEmail.includes('@')) return { message: PUBLIC_RESEND_MESSAGE };
  const client = await pool.connect();
  let delivery = null;
  try {
    await client.query('BEGIN');
    const result = await client.query(
      `SELECT id, email FROM users
       WHERE LOWER(email)=$1 AND role='STUDENT' AND status='PENDING' AND email_verified_at IS NULL
       FOR UPDATE`,
      [normalizedEmail]
    );
    if (result.rows[0]) {
      const token = await createToken(client, result.rows[0].id);
      delivery = { email: result.rows[0].email, rawToken: token.rawToken };
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
  if (delivery) {
    try { await deliverVerification(delivery); } catch (error) { logSafeDeliveryFailure(error); }
  }
  return { message: PUBLIC_RESEND_MESSAGE };
}

async function verifyEmail({ token }) {
  if (!validTokenShape(token)) throw new AppError(INVALID_TOKEN_MESSAGE, 400);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query(
      `SELECT verification.user_id
       FROM email_verification_tokens verification
       JOIN users account ON account.id=verification.user_id
       WHERE verification.token_hash=$1
         AND verification.used_at IS NULL
         AND verification.expires_at>NOW()
         AND account.role='STUDENT'
         AND account.status='PENDING'
         AND account.email_verified_at IS NULL
       FOR UPDATE OF verification, account`,
      [hashVerificationToken(token)]
    );
    if (!result.rows[0]) throw new AppError(INVALID_TOKEN_MESSAGE, 400);
    const userId = result.rows[0].user_id;
    await client.query(
      `UPDATE users
       SET status='ACTIVE', email_verified_at=NOW(), auth_version=auth_version+1
       WHERE id=$1 AND role='STUDENT' AND status='PENDING'`,
      [userId]
    );
    await client.query(
      'UPDATE email_verification_tokens SET used_at=NOW() WHERE user_id=$1 AND used_at IS NULL',
      [userId]
    );
    await client.query('COMMIT');
    return { message: VERIFIED_MESSAGE };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

module.exports = {
  issueForNewStudent,
  deliverVerification,
  resendVerification,
  verifyEmail,
  hashVerificationToken,
  PUBLIC_RESEND_MESSAGE,
  INVALID_TOKEN_MESSAGE,
  VERIFIED_MESSAGE,
};
