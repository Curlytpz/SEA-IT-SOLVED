const test = require('node:test');
const assert = require('node:assert/strict');
const config = require('../config/env');
const emailService = require('./email.service');

test('verification email uses the shared production provider with verification content', async () => {
  let sent;
  const verificationUrl = 'https://app.example.edu/verify-email?token=secret-verification-token';
  const originalInfo = console.info;
  const originalError = console.error;
  const logs = [];
  try {
    console.info = value => logs.push(String(value));
    console.error = value => logs.push(String(value));
    await emailService.sendWithResend({
      email: 'student@student.hau.edu.ph',
      verificationUrl,
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
  assert.match(sent.html, new RegExp(`<a href="${verificationUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"[^>]*>Verify Student Email</a>`));
  assert.match(sent.html, /If the button does not work, copy and paste this link into your browser:/);
  assert.match(sent.html, /This link expires in 60 minutes\./);
  assert.equal(logs.some(line => line.includes('secret-verification-token')), false);
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

test('instructor verification email uses instructor wording and the same safe link template', async () => {
  let sent;
  const verificationUrl = 'https://app.example.edu/verify-email?token=instructor-secret-token';
  const originalInfo = console.info;
  const logs = [];
  try {
    console.info = value => logs.push(String(value));
    await emailService.sendWithResend({
      email: 'professor@hau.edu.ph',
      verificationUrl,
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
  assert.match(sent.text, /Verify your instructor email/);
  assert.ok(sent.text.includes(verificationUrl));
  assert.ok(sent.html.includes(verificationUrl));
  assert.match(sent.html, />Verify Instructor Email<\/a>/);
  assert.equal(logs.some(line => line.includes('instructor-secret-token')), false);
});
