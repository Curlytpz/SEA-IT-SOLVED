const bcrypt = require('bcryptjs');
const pool   = require('../db/pool');
const { signToken } = require('../utils/jwt');
const AppError = require('../utils/AppError');
const config   = require('../config/env');
const { validatePassword } = require('./password-reset.service');
const emailVerification = require('./email-verification.service');

const SALT_ROUNDS = 12;
const DUMMY_LOGIN_PASSWORD_HASH = '$2b$12$4lkKXrjGtjbL5Kehn5f.NOVxB41JSJk08EL/4DKCL1bdnBHOKXPy2';
const LOGIN_ROLES = new Set(['STUDENT', 'INSTRUCTOR', 'ADMIN']);
const ROLE_ACCOUNT_LABELS = { STUDENT: 'a Student', INSTRUCTOR: 'an Instructor', ADMIN: 'an Administrator' };
const ROLE_SIGN_IN_LABELS = { STUDENT: 'Student', INSTRUCTOR: 'Instructor', ADMIN: 'Admin' };

// ─── Helpers ───────────────────────────────────────────────────────────────

function buildSafeUser(row) {
  // NEVER return password_hash to the client
  return {
    id:            row.id,
    firstName:     row.first_name,
    lastName:      row.last_name,
    email:         row.email,
    studentNumber: row.student_number || undefined,
    role:          row.role,
    status:        row.status,
    successfulLoginCount: Number(row.successful_login_count) || 0,
    createdAt:     row.created_at,
  };
}

/**
 * Validate that an email ends with the expected institutional domain.
 * Domain is read from config (env var), not hard-coded.
 */
function validateEmailDomain(email, domain, message) {
  if (!domain) return; // domain enforcement disabled for this role
  const normalised = email.trim().toLowerCase();
  if (!normalised.endsWith(`@${domain}`)) {
    throw new AppError(message || `Registration requires an institutional email address ending in @${domain}.`, 400);
  }
}

// ─── Register student ──────────────────────────────────────────────────────

async function registerStudent({ firstName, lastName, email, studentNumber, password }) {
  if (!firstName || !lastName || !email || !studentNumber || !password) {
    throw new AppError('All fields are required for student registration.', 400);
  }

  validateEmailDomain(email, config.STUDENT_EMAIL_DOMAIN);

  validatePassword(password);

  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
  const client = await pool.connect();
  let user;
  let delivery;
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `INSERT INTO users (first_name, last_name, email, student_number, password_hash, role, status)
       VALUES ($1, $2, $3, $4, $5, 'STUDENT', 'PENDING')
       RETURNING *`,
      [firstName.trim(), lastName.trim(), email.trim().toLowerCase(), studentNumber.trim(), passwordHash]
    );
    user = rows[0];
    delivery = await emailVerification.issueForNewStudent(client, user);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
  try {
    await emailVerification.deliverVerification(delivery);
  } catch (error) {
    const safeName = String(error?.name || 'Error').replace(/[^A-Za-z0-9_.-]/g, '').slice(0, 80) || 'Error';
    console.error(`[EmailVerification] Registration delivery failed name=${safeName}`);
  }
  return {
    user: buildSafeUser(user),
    verificationRequired: true,
    message: 'Check your institutional email to verify your student account before signing in.',
  };
}

// ─── Register instructor ───────────────────────────────────────────────────

async function registerInstructor({ firstName, lastName, email, password }) {
  if (!firstName || !lastName || !email || !password) {
    throw new AppError('All fields are required for instructor registration.', 400);
  }

  // Domain check — configurable via INSTRUCTOR_EMAIL_DOMAIN env var.
  // This is a first-line filter, NOT a substitute for admin approval.
  // Admin approval remains mandatory regardless of domain.
  validateEmailDomain(email, config.INSTRUCTOR_EMAIL_DOMAIN);

  validatePassword(password);

  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

  // Role is HARDCODED to INSTRUCTOR, status is HARDCODED to PENDING.
  // These values are NEVER read from the request.
  const { rows } = await pool.query(
    `INSERT INTO users (first_name, last_name, email, password_hash, role, status)
     VALUES ($1, $2, $3, $4, 'INSTRUCTOR', 'PENDING')
     RETURNING *`,
    [
      firstName.trim(),
      lastName.trim(),
      email.trim().toLowerCase(),
      passwordHash,
    ]
  );

  // No token is issued until this instructor is approved and signs in.
  return { user: buildSafeUser(rows[0]) };
}

// ─── Login ────────────────────────────────────────────────────────────────

async function login({ email, password, expectedRole }) {
  if (!email || !password) {
    throw new AppError('Email and password are required.', 400);
  }

  const normalizedExpectedRole = String(expectedRole || '').trim().toUpperCase();
  if (!LOGIN_ROLES.has(normalizedExpectedRole)) {
    throw new AppError('Choose Student, Instructor, or Admin sign in.', 400);
  }
  if (normalizedExpectedRole === 'STUDENT') {
    validateEmailDomain(email, config.STUDENT_EMAIL_DOMAIN, `Student sign in requires your HAU Student email ending in @${config.STUDENT_EMAIL_DOMAIN}.`);
  }

  const { rows } = await pool.query(
    'SELECT * FROM users WHERE LOWER(email) = $1',
    [email.trim().toLowerCase()]
  );

  // Generic message — never disclose whether the email exists (enumeration defence)
  const INVALID = 'Incorrect email or password.';
  const user = rows[0] || null;
  const match = await bcrypt.compare(password, user?.password_hash || DUMMY_LOGIN_PASSWORD_HASH);
  if (!user || !match) throw new AppError(INVALID, 401);

  if (user.role !== normalizedExpectedRole) {
    throw new AppError(
      `This account is registered as ${ROLE_ACCOUNT_LABELS[user.role]}. Please use ${ROLE_SIGN_IN_LABELS[user.role]} sign in.`,
      403
    );
  }

  if (user.role === 'INSTRUCTOR' && user.status === 'PENDING') {
    throw new AppError('Your instructor account is awaiting admin approval.', 403, { code: 'INSTRUCTOR_PENDING' });
  }
  if (user.role === 'STUDENT' && user.status === 'PENDING') {
    throw new AppError('Verify your student email before signing in.', 403, { code: 'STUDENT_EMAIL_UNVERIFIED' });
  }
  // These are hard stops at login time in addition to the per-request
  // checks in authenticate.js. authenticate.js catches token-reuse after
  // suspension; these catch it at the login attempt itself.
  if (user.status === 'REJECTED') {
    throw user.role === 'INSTRUCTOR'
      ? new AppError('Your instructor account was not approved.', 403, { code: 'INSTRUCTOR_REJECTED' })
      : new AppError('Your account has been rejected. Contact the administrator.', 403);
  }
  if (user.status === 'SUSPENDED') {
    throw new AppError('Your account has been suspended. Contact the administrator.', 403, {
      code: user.role === 'INSTRUCTOR' ? 'INSTRUCTOR_SUSPENDED' : undefined,
    });
  }

  // Record only a genuinely successful login. This happens after password,
  // role, and account-state validation, and the atomic increment prevents
  // concurrent login requests from observing the same sequence number.
  const successfulLogin = await pool.query(
    `UPDATE users
     SET successful_login_count = successful_login_count + 1
     WHERE id = $1 AND role = $2 AND status = 'ACTIVE'
     RETURNING *`,
    [user.id, user.role]
  );
  const authenticatedUser = successfulLogin.rows[0];
  if (!authenticatedUser) {
    throw new AppError('Your account access changed. Please try signing in again.', 403);
  }

  const token = signToken({ id: authenticatedUser.id, role: authenticatedUser.role, authVersion: Number(authenticatedUser.auth_version) || 0 });
  return { user: buildSafeUser(authenticatedUser), token };
}

// ─── Get me ───────────────────────────────────────────────────────────────

async function getMe(userId) {
  const { rows } = await pool.query(
    'SELECT * FROM users WHERE id = $1',
    [userId]
  );
  if (rows.length === 0) throw new AppError('User not found.', 404);
  return buildSafeUser(rows[0]);
}

module.exports = { registerStudent, registerInstructor, login, getMe };
