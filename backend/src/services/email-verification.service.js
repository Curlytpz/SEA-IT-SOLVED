const crypto = require('crypto');
const pool = require('../db/pool');
const config = require('../config/env');
const emailService = require('./email.service');
const { completeActiveLogin } = require('./auth-session.service');
const AppError = require('../utils/AppError');
const { verifyVerificationSession } = require('../utils/jwt');

const PUBLIC_RESEND_MESSAGE = 'If an unverified account exists for that email, a verification code has been sent.';
const INVALID_TOKEN_MESSAGE = 'The verification code is invalid or has expired.';
const VERIFIED_MESSAGE = 'Your student email has been verified. You can now sign in.';
const INSTRUCTOR_VERIFIED_MESSAGE = 'Email verified. Your instructor account is awaiting administrator approval.';
const ACTIVE_INSTRUCTOR_VERIFIED_MESSAGE = 'Your instructor email has been verified. You can now sign in.';

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase().slice(0, 255);
}

function hashVerificationToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function normalizeVerificationCode(value) {
  return String(value || '').trim().replace(/\s+/g, '');
}

function validCodeShape(code) {
  return /^\d{8}$/.test(code);
}

function generateVerificationCode() {
  return crypto.randomInt(0, 100000000).toString().padStart(8, '0');
}

async function createToken(client, userId) {
  const expiresAt = new Date(Date.now() + config.EMAIL_VERIFICATION_TTL_MINUTES * 60 * 1000);
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const rawCode = generateVerificationCode();
    const inserted = await client.query(
      `INSERT INTO email_verification_tokens(user_id, token_hash, expires_at)
       VALUES($1, $2, $3)
       ON CONFLICT (token_hash) DO NOTHING
       RETURNING token_hash`,
      [userId, hashVerificationToken(rawCode), expiresAt]
    );
    if (inserted.rows[0]) {
      return { rawCode, expiresAt };
    }
  }
  throw new Error('Unable to issue a unique email verification code.');
}

async function replaceUnusedTokens(client, userId) {
  await client.query(
    'UPDATE email_verification_tokens SET used_at=NOW() WHERE user_id=$1 AND used_at IS NULL',
    [userId]
  );
  return createToken(client, userId);
}

function buildVerificationUrl({
  frontendUrl = config.FRONTEND_URL,
  nodeEnv = config.NODE_ENV,
} = {}) {
  const base = String(frontendUrl || '').replace(/\/$/, '');
  const verificationUrl = new URL(`${base}/verify-email`);
  if (nodeEnv === 'production'
      && (verificationUrl.protocol !== 'https:' || /^(?:localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])$/i.test(verificationUrl.hostname))) {
    throw new Error('Production email verification requires a public HTTPS FRONTEND_URL.');
  }
  return verificationUrl.toString();
}

async function deliverVerification({ email, rawCode, role = 'STUDENT', status }) {
  return emailService.sendStudentVerificationEmail({
    email,
    verificationCode: rawCode,
    expiresInMinutes: config.EMAIL_VERIFICATION_TTL_MINUTES,
    role,
    accountStatus: status,
  });
}

function logSafeDeliveryFailure(error) {
  const safeName = String(error?.name || 'Error').replace(/[^A-Za-z0-9_.-]/g, '').slice(0, 80) || 'Error';
  const status = Number(error?.statusCode ?? error?.status);
  console.error(`[EmailVerification] Delivery failed name=${safeName} status=${Number.isInteger(status) ? status : 'UNKNOWN'}`);
}

async function issueForNewStudent(client, user) {
  const token = await createToken(client, user.id);
  return { email: user.email, rawCode: token.rawCode, role: 'STUDENT', status: user.status };
}

async function issueForNewInstructor(client, user) {
  const token = await createToken(client, user.id);
  return { email: user.email, rawCode: token.rawCode, role: 'INSTRUCTOR', status: user.status };
}

async function resendVerification({ email }) {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail || !normalizedEmail.includes('@')) return { message: PUBLIC_RESEND_MESSAGE };
  const client = await pool.connect();
  let delivery = null;
  try {
    await client.query('BEGIN');
    const result = await client.query(
      `SELECT id, email, role, status FROM users
       WHERE LOWER(email)=$1
         AND email_verified_at IS NULL
         AND (
           (role='STUDENT' AND status='PENDING')
           OR (role='INSTRUCTOR' AND status IN ('PENDING', 'ACTIVE'))
         )
       FOR UPDATE`,
      [normalizedEmail]
    );
    if (result.rows[0]) {
      const token = await replaceUnusedTokens(client, result.rows[0].id);
      delivery = {
        email: result.rows[0].email,
        rawCode: token.rawCode,
        role: result.rows[0].role,
        status: result.rows[0].status,
      };
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

function readVerificationSession(value) {
  if (!value) return null;
  try {
    return verifyVerificationSession(String(value));
  } catch {
    throw new AppError(INVALID_TOKEN_MESSAGE, 400);
  }
}

async function verifyEmail({ email, code, verificationSession }) {
  const normalizedEmail = normalizeEmail(email);
  const normalizedCode = normalizeVerificationCode(code);
  const session = readVerificationSession(verificationSession);
  if ((!session && (!normalizedEmail || !normalizedEmail.includes('@'))) || !validCodeShape(normalizedCode)) {
    throw new AppError(INVALID_TOKEN_MESSAGE, 400);
  }
  const client = await pool.connect();
  let verifiedAccount;
  try {
    await client.query('BEGIN');
    const result = session
      ? await client.query(
        `SELECT verification.user_id, account.role, account.status
         FROM email_verification_tokens verification
         JOIN users account ON account.id=verification.user_id
         WHERE verification.token_hash=$1
           AND account.id=$2
           AND account.role=$3
           AND account.auth_version=$4
           AND verification.used_at IS NULL
           AND verification.expires_at>NOW()
           AND (
             (account.role='STUDENT' AND account.status='PENDING')
             OR (account.role='INSTRUCTOR' AND account.status IN ('PENDING', 'ACTIVE'))
           )
           AND account.email_verified_at IS NULL
         FOR UPDATE OF verification, account`,
        [hashVerificationToken(normalizedCode), session.sub, session.role, Number(session.authVersion) || 0]
      )
      : await client.query(
        `SELECT verification.user_id, account.role, account.status
       FROM email_verification_tokens verification
       JOIN users account ON account.id=verification.user_id
       WHERE verification.token_hash=$1
         AND LOWER(account.email)=$2
         AND verification.used_at IS NULL
         AND verification.expires_at>NOW()
         AND (
           (account.role='STUDENT' AND account.status='PENDING')
           OR (account.role='INSTRUCTOR' AND account.status IN ('PENDING', 'ACTIVE'))
         )
         AND account.email_verified_at IS NULL
       FOR UPDATE OF verification, account`,
        [hashVerificationToken(normalizedCode), normalizedEmail]
      );
    if (!result.rows[0]) throw new AppError(INVALID_TOKEN_MESSAGE, 400);
    const userId = result.rows[0].user_id;
    const role = result.rows[0].role;
    const accountStatus = result.rows[0].status;
    if (role === 'STUDENT') {
      await client.query(
        `UPDATE users
         SET status='ACTIVE', email_verified_at=NOW(), auth_version=auth_version+1
         WHERE id=$1 AND role='STUDENT' AND status='PENDING'`,
        [userId]
      );
    } else {
      await client.query(
        `UPDATE users
         SET email_verified_at=NOW(), auth_version=auth_version+1
         WHERE id=$1 AND role='INSTRUCTOR' AND status IN ('PENDING', 'ACTIVE')`,
        [userId]
      );
    }
    await client.query(
      'UPDATE email_verification_tokens SET used_at=NOW() WHERE user_id=$1 AND used_at IS NULL',
      [userId]
    );
    await client.query('COMMIT');
    verifiedAccount = {
      userId,
      accountStatus,
      message: role === 'INSTRUCTOR'
        ? (accountStatus === 'ACTIVE' ? ACTIVE_INSTRUCTOR_VERIFIED_MESSAGE : INSTRUCTOR_VERIFIED_MESSAGE)
        : VERIFIED_MESSAGE,
      role,
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }

  if (session && (verifiedAccount.role === 'STUDENT' || verifiedAccount.accountStatus === 'ACTIVE')) {
    const authenticated = await completeActiveLogin({
      userId: verifiedAccount.userId,
      role: verifiedAccount.role,
    });
    return { message: verifiedAccount.message, role: verifiedAccount.role, ...authenticated };
  }
  return { message: verifiedAccount.message, role: verifiedAccount.role };
}

module.exports = {
  issueForNewStudent,
  issueForNewInstructor,
  deliverVerification,
  resendVerification,
  verifyEmail,
  hashVerificationToken,
  generateVerificationCode,
  normalizeVerificationCode,
  readVerificationSession,
  buildVerificationUrl,
  replaceUnusedTokens,
  PUBLIC_RESEND_MESSAGE,
  INVALID_TOKEN_MESSAGE,
  VERIFIED_MESSAGE,
  INSTRUCTOR_VERIFIED_MESSAGE,
  ACTIVE_INSTRUCTOR_VERIFIED_MESSAGE,
};
