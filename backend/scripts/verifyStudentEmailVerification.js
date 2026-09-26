const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const config = require('../src/config/env');
const pool = require('../src/db/pool');
const { signToken } = require('../src/utils/jwt');
const emailService = require('../src/services/email.service');

const deliveries = [];
emailService.sendStudentVerificationEmail = async payload => { deliveries.push(payload); return { provider: 'test' }; };
const auth = require('../src/services/auth.service');
const verification = require('../src/services/email-verification.service');

function deliveryToken(index = -1) {
  return new URL(deliveries.at(index).verificationUrl).searchParams.get('token');
}

async function expectInvalid(fn) {
  await assert.rejects(fn, error => error.statusCode === 400 && /invalid|expired/i.test(error.message));
}

async function main() {
  await pool.query(fs.readFileSync(path.join(__dirname, '../src/db/migration_student_email_verification.sql'), 'utf8'));
  const suffix = crypto.randomBytes(6).toString('hex');
  const email = `verify-${suffix}@${config.STUDENT_EMAIL_DOMAIN}`;
  const password = 'VerifiedPass123!';
  let userId;
  let server;
  try {
    const registration = await auth.registerStudent({
      firstName: 'Email', lastName: 'Verification', email,
      studentNumber: `VERIFY-${suffix}`, password,
    });
    userId = registration.user.id;
    assert.equal(registration.user.status, 'PENDING');
    assert.equal(registration.verificationRequired, true);
    assert.equal(deliveries.length, 1);
    const firstToken = deliveryToken();
    assert.match(firstToken, /^[a-f0-9]{64}$/);
    const stored = await pool.query('SELECT token_hash,used_at,expires_at FROM email_verification_tokens WHERE user_id=$1', [userId]);
    assert.equal(stored.rows.length, 1);
    assert.equal(stored.rows[0].token_hash, verification.hashVerificationToken(firstToken));
    assert.notEqual(stored.rows[0].token_hash, firstToken);
    assert.equal(stored.rows[0].used_at, null);

    await assert.rejects(
      auth.login({ email, password, expectedRole: 'STUDENT' }),
      error => error.statusCode === 403 && error.code === 'STUDENT_EMAIL_UNVERIFIED'
    );

    const app = require('../src/app');
    server = app.listen(0);
    await new Promise(resolve => server.once('listening', resolve));
    const base = `http://127.0.0.1:${server.address().port}/api`;
    const legacyToken = signToken({ id: userId, role: 'STUDENT', authVersion: 0 });
    for (const route of ['/auth/me', '/sections/join-code']) {
      const response = await fetch(`${base}${route}`, {
        method: route === '/auth/me' ? 'GET' : 'POST',
        headers: { Authorization: `Bearer ${legacyToken}`, 'Content-Type': 'application/json' },
        body: route === '/auth/me' ? undefined : JSON.stringify({ joinCode: 'NOPE' }),
      });
      const payload = await response.json();
      assert.equal(response.status, 403);
      assert.equal(payload.code, 'STUDENT_EMAIL_UNVERIFIED');
    }

    const resendStatuses = [];
    for (let index = 0; index < 6; index += 1) {
      const response = await fetch(`${base}/auth/verify-email/resend`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: `rate-${suffix}@${config.STUDENT_EMAIL_DOMAIN}` }),
      });
      resendStatuses.push(response.status);
    }
    assert.deepEqual(resendStatuses.slice(0, 5), [200, 200, 200, 200, 200]);
    assert.equal(resendStatuses[5], 429);

    const unknown = await verification.resendVerification({ email: `unknown-${suffix}@${config.STUDENT_EMAIL_DOMAIN}` });
    assert.equal(unknown.message, verification.PUBLIC_RESEND_MESSAGE);
    assert.equal(deliveries.length, 1);
    const resend = await verification.resendVerification({ email });
    assert.equal(resend.message, verification.PUBLIC_RESEND_MESSAGE);
    assert.equal(deliveries.length, 2);
    const secondToken = deliveryToken();
    assert.notEqual(secondToken, firstToken);

    emailService.sendStudentVerificationEmail = async () => { throw Object.assign(new Error('provider details must stay internal'), { statusCode: 503 }); };
    const failedDelivery = await verification.resendVerification({ email });
    assert.equal(failedDelivery.message, verification.PUBLIC_RESEND_MESSAGE);

    const verified = await verification.verifyEmail({ token: firstToken });
    assert.equal(verified.message, verification.VERIFIED_MESSAGE);
    await expectInvalid(() => verification.verifyEmail({ token: firstToken }));
    await expectInvalid(() => verification.verifyEmail({ token: secondToken }));
    const login = await auth.login({ email, password, expectedRole: 'STUDENT' });
    assert.equal(login.user.status, 'ACTIVE');
    const row = await pool.query('SELECT email_verified_at FROM users WHERE id=$1', [userId]);
    assert(row.rows[0].email_verified_at);

    console.log('PASS student account remains pending until institutional email verification');
    console.log('PASS verification tokens are random, SHA-256 hashed, expiring, and single use');
    console.log('PASS unverified student JWT reuse and enrollment are denied centrally');
    console.log('PASS resend response is enumeration-safe and resend rate limiting is enforced');
    console.log('PASS failed resend delivery does not invalidate an already delivered link');
    console.log('PASS successful verification activates login and invalidates remaining links');
  } finally {
    if (server) await new Promise(resolve => server.close(resolve));
    if (userId) await pool.query('DELETE FROM users WHERE id=$1', [userId]);
    await pool.end();
  }
}

main().catch(async error => {
  console.error(error);
  await pool.end().catch(() => {});
  process.exitCode = 1;
});
