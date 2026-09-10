const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const config = require('../src/config/env');
const pool = require('../src/db/pool');
const emailService = require('../src/services/email.service');

const deliveries = [];
emailService.sendPasswordResetEmail = async payload => { deliveries.push(payload); return { provider: 'test' }; };

const passwordReset = require('../src/services/password-reset.service');
const authService = require('../src/services/auth.service');

function tokenFromDelivery(delivery) {
  return new URL(delivery.resetUrl).searchParams.get('token');
}

async function expectInvalid(fn) {
  await assert.rejects(fn, error => error.statusCode === 400 && /invalid|expired/i.test(error.message));
}

async function main() {
  const originalNodeEnv = config.NODE_ENV;
  const originalMailProvider = config.MAIL_PROVIDER;
  const originalInfo = console.info;
  const developmentLogs = [];
  try {
    config.NODE_ENV = 'development';
    config.MAIL_PROVIDER = 'development';
    console.info = message => developmentLogs.push(String(message));
    emailService.sendWithDevelopmentTransport({
      email: 'student@student.hau.edu.ph',
      resetUrl: 'http://localhost:5173/reset-password?token=development-test-token',
      expiresInMinutes: 30,
    });
  } finally {
    console.info = originalInfo;
    config.NODE_ENV = originalNodeEnv;
    config.MAIL_PROVIDER = originalMailProvider;
  }
  assert.equal(developmentLogs.length, 1);
  assert.match(developmentLogs[0], /SEA-IT-SOLVED PASSWORD RESET/);
  assert.match(developmentLogs[0], /Recipient: student@student\.hau\.edu\.ph/);
  assert.match(developmentLogs[0], /http:\/\/localhost:5173\/reset-password\?token=development-test-token/);
  assert.match(developmentLogs[0], /Expires: 30 minutes/);

  const productionLogs = [];
  try {
    config.NODE_ENV = 'production';
    console.info = message => productionLogs.push(String(message));
    assert.throws(() => emailService.sendWithDevelopmentTransport({
      email: 'student@student.hau.edu.ph',
      resetUrl: 'http://localhost:5173/reset-password?token=must-not-be-logged',
      expiresInMinutes: 30,
    }), /disabled outside development/);
  } finally {
    console.info = originalInfo;
    config.NODE_ENV = originalNodeEnv;
    config.MAIL_PROVIDER = originalMailProvider;
  }
  assert.equal(productionLogs.length, 0, 'Production must never log a raw reset URL.');

  const migration = fs.readFileSync(path.join(__dirname, '../src/db/migration_password_reset.sql'), 'utf8');
  await pool.query(migration);
  const suffix = crypto.randomBytes(6).toString('hex');
  const studentEmail = `reset-${suffix}@student.hau.edu.ph`;
  const instructorEmail = `reset-${suffix}@hau.edu.ph`;
  const oldPassword = 'OriginalPass123!';
  const newPassword = 'UpdatedPass456!';
  const passwordHash = await bcrypt.hash(oldPassword, 4);
  const userIds = [];
  let server;

  try {
    for (const account of [
      { email: studentEmail, role: 'STUDENT', status: 'ACTIVE' },
      { email: instructorEmail, role: 'INSTRUCTOR', status: 'ACTIVE' },
    ]) {
      const { rows } = await pool.query(
        `INSERT INTO users(first_name,last_name,email,password_hash,role,status)
         VALUES('Password','Reset Test',$1,$2,$3,$4) RETURNING id`,
        [account.email, passwordHash, account.role, account.status]
      );
      userIds.push(rows[0].id);
    }

    const known = await passwordReset.requestPasswordReset({ email: studentEmail.toUpperCase(), role: 'STUDENT' });
    const unknown = await passwordReset.requestPasswordReset({ email: `unknown-${suffix}@student.hau.edu.ph`, role: 'STUDENT' });
    assert.equal(known.message, passwordReset.PUBLIC_REQUEST_MESSAGE);
    assert.equal(unknown.message, passwordReset.PUBLIC_REQUEST_MESSAGE);
    assert.deepEqual(Object.keys(known), ['message'], 'The public response must not expose a reset token or URL.');
    assert.equal(deliveries.length, 1, 'Unknown accounts must not create reset deliveries.');
    const wrongStudentDomain = await passwordReset.requestPasswordReset({ email: instructorEmail, role: 'STUDENT' });
    assert.equal(wrongStudentDomain.message, passwordReset.PUBLIC_REQUEST_MESSAGE);
    assert.equal(deliveries.length, 1, 'Student recovery must enforce the Student email domain and role.');

    const replacedStudentToken = tokenFromDelivery(deliveries[0]);
    await passwordReset.requestPasswordReset({ email: studentEmail, role: 'STUDENT' });
    const studentToken = tokenFromDelivery(deliveries.at(-1));
    await expectInvalid(() => passwordReset.validateResetToken({ token: replacedStudentToken }));
    assert.match(studentToken, /^[a-f0-9]{64}$/);
    const stored = await pool.query(
      'SELECT token_hash,expires_at,used_at FROM password_reset_tokens WHERE user_id=$1 ORDER BY created_at DESC LIMIT 1',
      [userIds[0]]
    );
    assert.equal(stored.rows[0].token_hash, passwordReset.hashResetToken(studentToken));
    assert.notEqual(stored.rows[0].token_hash, studentToken, 'Raw token must never be stored.');
    assert.equal(stored.rows[0].used_at, null);
    const minutesRemaining = (new Date(stored.rows[0].expires_at).getTime() - Date.now()) / 60000;
    assert(minutesRemaining > 19 && minutesRemaining <= 30.1);

    await passwordReset.validateResetToken({ token: studentToken });
    await passwordReset.resetPassword({ token: studentToken, password: newPassword });
    await expectInvalid(() => passwordReset.validateResetToken({ token: studentToken }));
    await expectInvalid(() => passwordReset.resetPassword({ token: studentToken, password: newPassword }));
    await assert.rejects(() => authService.login({ email: studentEmail, password: oldPassword, expectedRole: 'STUDENT' }), /Incorrect email or password/);
    const login = await authService.login({ email: studentEmail, password: newPassword, expectedRole: 'STUDENT' });
    assert.equal(login.user.role, 'STUDENT');
    const version = await pool.query('SELECT auth_version FROM users WHERE id=$1', [userIds[0]]);
    assert.equal(version.rows[0].auth_version, 1);

    await passwordReset.requestPasswordReset({ email: studentEmail, role: 'STUDENT' });
    const expiredToken = tokenFromDelivery(deliveries.at(-1));
    await pool.query('UPDATE password_reset_tokens SET expires_at=NOW()-INTERVAL \'1 minute\' WHERE token_hash=$1', [passwordReset.hashResetToken(expiredToken)]);
    await expectInvalid(() => passwordReset.validateResetToken({ token: expiredToken }));

    await passwordReset.requestPasswordReset({ email: instructorEmail, role: 'INSTRUCTOR' });
    assert.equal(deliveries.at(-1).email, instructorEmail);
    const instructorToken = tokenFromDelivery(deliveries.at(-1));
    await passwordReset.validateResetToken({ token: instructorToken });

    const app = require('../src/app');
    server = app.listen(0);
    await new Promise(resolve => server.once('listening', resolve));
    const base = `http://127.0.0.1:${server.address().port}/api/auth`;

    const publicResponse = await fetch(`${base}/forgot-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: studentEmail, role: 'STUDENT' }),
    });
    const publicPayload = await publicResponse.json();
    assert.equal(publicResponse.status, 200);
    assert.deepEqual(publicPayload, {
      success: true,
      data: { message: passwordReset.PUBLIC_REQUEST_MESSAGE },
    });
    assert.doesNotMatch(JSON.stringify(publicPayload), /resetUrl|token/i, 'The API must never expose a reset URL or token.');

    const forgotStatuses = [];
    for (let index = 0; index < 5; index += 1) {
      const response = await fetch(`${base}/forgot-password`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: `rate-${suffix}@student.hau.edu.ph`, role: 'STUDENT' }) });
      forgotStatuses.push(response.status);
    }
    assert.deepEqual(forgotStatuses.slice(0, 4), [200, 200, 200, 200]);
    assert.equal(forgotStatuses[4], 429);

    const resetStatuses = [];
    for (let index = 0; index < 11; index += 1) {
      const response = await fetch(`${base}/reset-password/validate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: 'invalid' }) });
      resetStatuses.push(response.status);
    }
    assert.deepEqual(resetStatuses.slice(0, 10), Array(10).fill(400));
    assert.equal(resetStatuses[10], 429);

    console.log('PASS student reset request and generic response');
    console.log('PASS development reset-link terminal transport');
    console.log('PASS unknown-email enumeration protection');
    console.log('PASS previous reset token invalidation');
    console.log('PASS SHA-256 token storage and 20–30 minute expiry');
    console.log('PASS password update, old-password rejection, and new-password login');
    console.log('PASS token single use and expired-token rejection');
    console.log('PASS instructor account recovery');
    console.log('PASS forgot-password and reset-attempt rate limiting');
  } finally {
    if (server) await new Promise(resolve => server.close(resolve));
    if (userIds.length) await pool.query('DELETE FROM users WHERE id=ANY($1::uuid[])', [userIds]);
    await pool.end();
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
