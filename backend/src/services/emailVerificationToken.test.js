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
  const client = {
    release() {},
    async query(sql, values = []) {
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
        return { rows: [{ token_hash: values[1] }] };
      }
      if (/SELECT verification\.user_id/.test(sql)) {
        const match = tokens.find(token => token.hash === values[0]
          && values[1] === user.email
          && token.usedAt === null
          && token.expiresAt > new Date());
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
  return { user, tokens, client };
}

async function withHarness(run) {
  const originalConnect = pool.connect;
  const originalSend = emailService.sendStudentVerificationEmail;
  const harness = tokenHarness();
  let delivered;
  pool.connect = async () => harness.client;
  emailService.sendStudentVerificationEmail = async payload => {
    delivered = payload;
    return { accepted: true };
  };
  try {
    await run(harness, () => delivered);
  } finally {
    pool.connect = originalConnect;
    emailService.sendStudentVerificationEmail = originalSend;
  }
}

test('verification codes are exactly eight numeric digits', () => {
  for (let index = 0; index < 100; index += 1) {
    assert.match(verification.generateVerificationCode(), /^\d{8}$/);
  }
});

test('production verification page URLs require HTTPS, reject localhost, and contain no code', () => {
  const value = verification.buildVerificationUrl({
    frontendUrl: 'https://sea-it-solved.example/portal/', nodeEnv: 'production',
  });
  const url = new URL(value);
  assert.equal(url.protocol, 'https:');
  assert.equal(url.hostname, 'sea-it-solved.example');
  assert.equal(url.pathname, '/portal/verify-email');
  assert.equal(url.search, '');
  assert.throws(() => verification.buildVerificationUrl({
    frontendUrl: 'http://localhost:5173', nodeEnv: 'production',
  }), /public HTTPS FRONTEND_URL/);
});

test('resend stores only a SHA-256 hash, invalidates the old code, and newest code succeeds once', async () => {
  await withHarness(async (harness, deliveredValue) => {
    const oldCode = '12345678';
    harness.tokens.push({
      userId: harness.user.id,
      hash: verification.hashVerificationToken(oldCode),
      expiresAt: new Date(Date.now() + 3600000),
      usedAt: null,
    });

    const result = await verification.resendVerification({ email: harness.user.email });
    const delivered = deliveredValue();
    const newestCode = delivered.verificationCode;
    assert.equal(result.message, verification.PUBLIC_RESEND_MESSAGE);
    assert.match(newestCode, /^\d{8}$/);
    assert.equal(delivered.verificationUrl, undefined);
    assert.equal(harness.tokens.length, 2);
    assert.notEqual(harness.tokens[0].usedAt, null);
    assert.equal(harness.tokens[1].usedAt, null);
    assert.equal(harness.tokens[1].hash, verification.hashVerificationToken(newestCode));
    assert.notEqual(harness.tokens[1].hash, newestCode);
    assert.equal(harness.tokens.filter(token => token.usedAt === null).length, 1);

    for (const code of [oldCode, '87654321']) {
      await assert.rejects(
        verification.verifyEmail({ email: harness.user.email, code }),
        error => error.statusCode === 400 && error.message === verification.INVALID_TOKEN_MESSAGE,
      );
    }
    const verified = await verification.verifyEmail({ email: harness.user.email, code: newestCode });
    assert.equal(verified.message, verification.VERIFIED_MESSAGE);
    assert.equal(harness.user.emailVerified, true);
    assert.equal(harness.tokens.filter(token => token.usedAt === null).length, 0);
    await assert.rejects(
      verification.verifyEmail({ email: harness.user.email, code: newestCode }),
      error => error.statusCode === 400 && error.message === verification.INVALID_TOKEN_MESSAGE,
    );
  });
});

test('expired code is rejected with the same public error', async () => {
  await withHarness(async (harness) => {
    const expiredCode = '23456789';
    harness.tokens.push({
      userId: harness.user.id,
      hash: verification.hashVerificationToken(expiredCode),
      expiresAt: new Date(Date.now() - 1000),
      usedAt: null,
    });
    await assert.rejects(
      verification.verifyEmail({ email: harness.user.email, code: expiredCode }),
      error => error.statusCode === 400 && error.message === verification.INVALID_TOKEN_MESSAGE,
    );
  });
});
