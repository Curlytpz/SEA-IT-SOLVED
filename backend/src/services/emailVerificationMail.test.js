const test = require('node:test');
const assert = require('node:assert/strict');
const config = require('../config/env');
const emailService = require('./email.service');

test('verification email uses the shared production provider with verification content', async () => {
  let sent;
  await emailService.sendWithResend({
    email: 'student@student.hau.edu.ph',
    verificationUrl: 'https://app.example.edu/verify-email?token=secret-verification-token',
    expiresInMinutes: 60,
  }, {
    settings: { apiKey: 'test-key', from: 'SEA-IT-SOLVED <no-reply@example.edu>' },
    resendClient: { emails: { send: async payload => { sent = payload; return { data: { id: 'message-id' } }; } } },
  });
  assert.equal(sent.subject, emailService.VERIFICATION_SUBJECT);
  assert.match(sent.text, /verify-email\?token=secret-verification-token/);
  assert.match(sent.html, /Verify Email/);
});

test('development verification delivery refuses the link without logging its token', async () => {
  const originalEnvironment = config.NODE_ENV;
  const originalProvider = config.MAIL_PROVIDER;
  const originalInfo = console.info;
  const originalError = console.error;
  const logs = [];
  try {
    config.NODE_ENV = 'development';
    config.MAIL_PROVIDER = 'development';
    console.info = value => logs.push(String(value));
    console.error = value => logs.push(String(value));
    await assert.rejects(() => emailService.sendStudentVerificationEmail({
      email: 'student@student.hau.edu.ph',
      verificationUrl: 'http://localhost:5173/verify-email?token=must-not-be-logged',
      expiresInMinutes: 60,
    }), /configured email provider/);
  } finally {
    config.NODE_ENV = originalEnvironment;
    config.MAIL_PROVIDER = originalProvider;
    console.info = originalInfo;
    console.error = originalError;
  }
  assert.equal(logs.some(line => line.includes('must-not-be-logged')), false);
});
