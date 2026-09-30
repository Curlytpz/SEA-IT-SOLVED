const assert = require('node:assert/strict');
const test = require('node:test');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const config = require('../config/env');
const pool = require('../db/pool');
const auth = require('./auth.service');
const verification = require('./email-verification.service');
const { completeActiveLogin, createVerificationSession } = require('./auth-session.service');
const { verifyToken, verifyVerificationSession } = require('../utils/jwt');

function account(overrides = {}) {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    first_name: 'Test',
    last_name: 'Account',
    email: 'student@student.hau.edu.ph',
    password_hash: '',
    student_number: '20260001',
    role: 'STUDENT',
    status: 'PENDING',
    email_verified_at: null,
    auth_version: 0,
    successful_login_count: 0,
    created_at: new Date(),
    ...overrides,
  };
}

test('correct credentials expose a purpose-limited session; wrong credentials do not', async () => {
  const originalQuery = pool.query;
  const user = account({ password_hash: await bcrypt.hash('CorrectPass123!', 4) });
  pool.query = async sql => {
    if (/SELECT \* FROM users WHERE LOWER\(email\)/.test(sql)) return { rows: [user] };
    throw new Error(`Unexpected SQL: ${sql}`);
  };
  try {
    let temporary;
    await assert.rejects(
      auth.login({ email: user.email, password: 'CorrectPass123!', expectedRole: 'STUDENT' }),
      error => {
        temporary = error.details?.verificationSession;
        return error.code === 'STUDENT_EMAIL_UNVERIFIED' && typeof temporary === 'string';
      },
    );
    const claims = verifyVerificationSession(temporary);
    assert.equal(claims.sub, user.id);
    assert.equal(claims.role, 'STUDENT');
    assert.equal(claims.purpose, 'EMAIL_VERIFICATION');
    assert.equal(claims.password, undefined);
    assert.ok(claims.exp - claims.iat <= 10 * 60);
    assert.throws(() => verifyToken(temporary), /Invalid application token/);

    await assert.rejects(
      auth.login({ email: user.email, password: 'WrongPass123!', expectedRole: 'STUDENT' }),
      error => error.statusCode === 401
        && error.message === 'Incorrect email or password.'
        && error.details === undefined,
    );
  } finally {
    pool.query = originalQuery;
  }
});

test('shared login completion preserves existing ADMIN authentication rules', async () => {
  const originalQuery = pool.query;
  const admin = account({
    id: '33333333-3333-4333-8333-333333333333',
    email: 'admin@example.edu',
    student_number: null,
    role: 'ADMIN',
    status: 'ACTIVE',
    email_verified_at: null,
  });
  pool.query = async (sql, values) => {
    assert.match(sql, /role = 'ADMIN' OR email_verified_at IS NOT NULL/);
    assert.deepEqual(values, [admin.id, 'ADMIN']);
    return { rows: [admin] };
  };
  try {
    const result = await completeActiveLogin({ userId: admin.id, role: 'ADMIN' });
    assert.equal(result.user.role, 'ADMIN');
    assert.equal(verifyToken(result.token).id, admin.id);
  } finally {
    pool.query = originalQuery;
  }
});

test('invalid and expired verification sessions are rejected safely', () => {
  assert.throws(() => verification.readVerificationSession('invalid-token'), error => error.statusCode === 400);
  const expired = jwt.sign({
    sub: '11111111-1111-4111-8111-111111111111',
    role: 'STUDENT',
    authVersion: 0,
    purpose: 'EMAIL_VERIFICATION',
  }, config.JWT_SECRET, {
    expiresIn: -1,
    audience: 'email-verification',
    issuer: 'sea-it-solved',
  });
  assert.throws(() => verification.readVerificationSession(expired), error => error.statusCode === 400);
});

test('student verification session completes normal login, while pending instructor remains blocked', async () => {
  const originalConnect = pool.connect;
  const originalQuery = pool.query;

  async function runFor(user, code) {
    let tokenUsed = false;
    const tokenHash = verification.hashVerificationToken(code);
    const client = {
      release() {},
      async query(sql, values = []) {
        if (/^(?:BEGIN|COMMIT|ROLLBACK)$/.test(sql)) return { rows: [] };
        if (/SELECT verification\.user_id/.test(sql)) {
          const matches = values[0] === tokenHash
            && values[1] === user.id
            && values[2] === user.role
            && Number(values[3]) === user.auth_version
            && !tokenUsed;
          return { rows: matches ? [{ user_id: user.id, role: user.role, status: user.status }] : [] };
        }
        if (/UPDATE users\s+SET status='ACTIVE'/.test(sql)) {
          user.status = 'ACTIVE';
          user.email_verified_at = new Date();
          user.auth_version += 1;
          return { rows: [] };
        }
        if (/UPDATE users\s+SET email_verified_at=NOW\(\)/.test(sql)) {
          user.email_verified_at = new Date();
          user.auth_version += 1;
          return { rows: [] };
        }
        if (/UPDATE email_verification_tokens SET used_at=NOW\(\)/.test(sql)) {
          tokenUsed = true;
          return { rows: [] };
        }
        throw new Error(`Unexpected transaction SQL: ${sql}`);
      },
    };
    pool.connect = async () => client;
    pool.query = async (sql, values = []) => {
      if (/SET successful_login_count/.test(sql)
          && values[0] === user.id
          && values[1] === user.role
          && user.status === 'ACTIVE'
          && user.email_verified_at) {
        user.successful_login_count += 1;
        return { rows: [user] };
      }
      return { rows: [] };
    };
    return verification.verifyEmail({
      code,
      verificationSession: createVerificationSession(user),
    });
  }

  try {
    const student = account();
    const studentResult = await runFor(student, '12345678');
    assert.equal(studentResult.role, 'STUDENT');
    assert.equal(studentResult.user.status, 'ACTIVE');
    assert.equal(typeof studentResult.token, 'string');
    assert.equal(verifyToken(studentResult.token).id, student.id);

    const instructor = account({
      id: '22222222-2222-4222-8222-222222222222',
      email: 'professor@hau.edu.ph',
      student_number: null,
      role: 'INSTRUCTOR',
    });
    const instructorResult = await runFor(instructor, '87654321');
    assert.equal(instructorResult.role, 'INSTRUCTOR');
    assert.equal(instructor.status, 'PENDING');
    assert.equal(instructorResult.token, undefined);
    assert.equal(instructorResult.message, verification.INSTRUCTOR_VERIFIED_MESSAGE);
  } finally {
    pool.connect = originalConnect;
    pool.query = originalQuery;
  }
});
