const test = require('node:test');
const assert = require('node:assert/strict');
const config = require('../config/env');
const emailService = require('./email.service');

test('verification email contains a code and token-free verification page in both alternatives', async () => {
  let sent;
  const verificationUrl = 'https://app.example.edu/verify-email';
  const verificationCode = '12345678';
  const originalInfo = console.info;
  const originalError = console.error;
  const logs = [];
  try {
    console.info = value => logs.push(String(value));
    console.error = value => logs.push(String(value));
    await emailService.sendWithResend({
      email: 'student@student.hau.edu.ph',
      verificationUrl,
      verificationCode,
      expiresInMinutes: 60,
    }, {
      settings: { apiKey: 'test-key', from: 'SEA-IT-SOLVED <no-reply@example.edu>' },
      resendClient: { emails: { send: async payload => { sent = payload; return { data: { id: 'message-id' } }; } } },
    });
  } finally {
    console.info = originalInfo;
    console.error = originalError;
  }

  assert.equal(sent.subject, emailService.VERIFICATION_SUBJECT);
  assert.ok(sent.text.includes(verificationUrl));
  assert.ok(sent.html.includes(verificationUrl));
  assert.ok(sent.text.includes(verificationCode));
  assert.ok(sent.html.includes(verificationCode));
  assert.doesNotMatch(sent.text + sent.html, /\?token=/);
  assert.match(sent.html, />Open Verification Page<\/a>/);
  assert.match(sent.html, /This code expires in 1 hour\./);
  assert.match(sent.text, /^SEA-IT-SOLVED\n\nYour email verification code is:/);
  assert.match(sent.text, /This code expires in 1 hour\./);
  assert.match(sent.text, /If you did not create this account, you can ignore this email\./);
  assert.equal(logs.some(line => line.includes(verificationCode)), false);
  assert.equal(logs.some(line => line.includes(verificationUrl)), false);
});

test('development verification delivery refuses a missing provider without logging its code', async () => {
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
      verificationUrl: 'http://localhost:5173/verify-email',
      verificationCode: '87654321',
      expiresInMinutes: 60,
    }), /configured email provider/);
  } finally {
    config.NODE_ENV = originalEnvironment;
    config.MAIL_PROVIDER = originalProvider;
    console.info = originalInfo;
    console.error = originalError;
  }
  assert.equal(logs.some(line => line.includes('87654321')), false);
});

test('instructor verification uses the same code template and preserves approval wording', async () => {
  let sent;
  const verificationUrl = 'https://app.example.edu/verify-email';
  const originalInfo = console.info;
  const logs = [];
  try {
    console.info = value => logs.push(String(value));
    await emailService.sendWithResend({
      email: 'professor@hau.edu.ph',
      verificationUrl,
      verificationCode: '34567890',
      expiresInMinutes: 60,
      role: 'INSTRUCTOR',
    }, {
      settings: { apiKey: 'test-key', from: 'SEA-IT-SOLVED <no-reply@example.edu>' },
      resendClient: { emails: { send: async payload => { sent = payload; return { data: { id: 'message-id' } }; } } },
    });
  } finally {
    console.info = originalInfo;
  }

  assert.equal(sent.subject, emailService.INSTRUCTOR_VERIFICATION_SUBJECT);
  assert.match(sent.text, /Your email verification code is:/);
  assert.ok(sent.text.includes(verificationUrl));
  assert.ok(sent.html.includes(verificationUrl));
  assert.match(sent.html, />Open Verification Page<\/a>/);
  assert.match(sent.html, /remain pending until administrator approval/);
  assert.equal(logs.some(line => line.includes('34567890')), false);
});
