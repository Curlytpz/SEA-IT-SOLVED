const assert = require('node:assert/strict');
const test = require('node:test');
const pool = require('../db/pool');
const emailService = require('./email.service');
const verification = require('./email-verification.service');

function tokenHarness() {
  const user = {
    id: '11111111-1111-4111-8111-111111111111',
    email: 'student@student.hau.edu.ph',
    role: 'STUDENT',
    status: 'PENDING',
    emailVerified: false,
  };
  const tokens = [];
  const queries = [];
  const client = {
    release() {},
    async query(sql, values = []) {
      queries.push({ sql, values });
      if (/^(?:BEGIN|COMMIT|ROLLBACK)$/.test(sql)) return { rows: [] };
      if (/SELECT id, email, role, status FROM users/.test(sql)) {
        return { rows: user.emailVerified ? [] : [{ id: user.id, email: user.email, role: user.role, status: user.status }] };
      }
      if (/UPDATE email_verification_tokens SET used_at=NOW\(\) WHERE user_id=\$1 AND used_at IS NULL/.test(sql)) {
        for (const token of tokens) if (token.userId === values[0] && token.usedAt === null) token.usedAt = new Date();
        return { rows: [] };
      }
      if (/INSERT INTO email_verification_tokens/.test(sql)) {
        tokens.push({ userId: values[0], hash: values[1], expiresAt: values[2], usedAt: null });
        return { rows: [] };
      }
      if (/SELECT verification\.user_id/.test(sql)) {
        const match = tokens.find(token => token.hash === values[0] && token.usedAt === null && token.expiresAt > new Date());
        return { rows: match && !user.emailVerified ? [{ user_id: user.id, role: user.role, status: user.status }] : [] };
      }
      if (/UPDATE users\s+SET status='ACTIVE'/.test(sql)) {
        user.status = 'ACTIVE';
        user.emailVerified = true;
        return { rows: [] };
      }
      throw new Error(`Unexpected SQL in token harness: ${sql}`);
    },
  };
  return { user, tokens, queries, client };
}

test('production verification URLs require HTTPS and reject localhost', () => {
  const value = verification.buildVerificationUrl('a'.repeat(64), {
    frontendUrl: 'https://sea-it-solved.example/portal/', nodeEnv: 'production',
  });
  const url = new URL(value);
  assert.equal(url.protocol, 'https:');
  assert.equal(url.hostname, 'sea-it-solved.example');
  assert.equal(url.pathname, '/portal/verify-email');
  assert.equal(url.searchParams.get('token'), 'a'.repeat(64));
  assert.throws(() => verification.buildVerificationUrl('a'.repeat(64), {
    frontendUrl: 'http://localhost:5173', nodeEnv: 'production',
  }), /public HTTPS FRONTEND_URL/);
});

test('resend invalidates previous tokens, stores only a hash, and only the newest token verifies', async () => {
  const originalConnect = pool.connect;
  const originalSend = emailService.sendStudentVerificationEmail;
  const harness = tokenHarness();
  const oldToken = 'b'.repeat(64);
  harness.tokens.push({
    userId: harness.user.id,
    hash: verification.hashVerificationToken(oldToken),
    expiresAt: new Date(Date.now() + 3600000),
    usedAt: null,
  });
  let delivered;
  pool.connect = async () => harness.client;
  emailService.sendStudentVerificationEmail = async payload => { delivered = payload; return { accepted: true }; };
  try {
    const result = await verification.resendVerification({ email: harness.user.email });
    assert.equal(result.message, verification.PUBLIC_RESEND_MESSAGE);
    const newestToken = new URL(delivered.verificationUrl).searchParams.get('token');
    assert.match(newestToken, /^[a-f0-9]{64}$/);
    assert.equal(harness.tokens.length, 2);
    assert.notEqual(harness.tokens[0].usedAt, null);
    assert.equal(harness.tokens[1].usedAt, null);
    assert.equal(harness.tokens[1].hash, verification.hashVerificationToken(newestToken));
    assert.notEqual(harness.tokens[1].hash, newestToken);
    assert.equal(harness.tokens.filter(token => token.usedAt === null).length, 1);

    await assert.rejects(
      verification.verifyEmail({ token: oldToken }),
      error => error.statusCode === 400 && /invalid|expired/i.test(error.message),
    );
    const verified = await verification.verifyEmail({ token: newestToken });
    assert.equal(verified.message, verification.VERIFIED_MESSAGE);
    assert.equal(harness.user.emailVerified, true);
    assert.equal(harness.tokens.filter(token => token.usedAt === null).length, 0);
  } finally {
    pool.connect = originalConnect;
    emailService.sendStudentVerificationEmail = originalSend;
  }
});
