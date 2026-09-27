const test = require('node:test');
const assert = require('node:assert/strict');
const nodemailer = require('nodemailer');
const config = require('../config/env');
const emailService = require('./email.service');

const settings = {
  clientId: 'test-client-id',
  clientSecret: 'test-client-secret',
  refreshToken: 'test-refresh-token',
  user: 'seaitsolved.project@gmail.com',
  from: 'SEA-IT-SOLVED <seaitsolved.project@gmail.com>',
};

function decodeBase64Url(value) {
  return Buffer.from(value, 'base64url').toString('utf8');
}

function decodeMimePart(message, contentType) {
  const marker = 'Content-Type: ' + contentType + '; charset="UTF-8"';
  const partStart = message.indexOf(marker);
  assert.notEqual(partStart, -1, contentType + ' MIME part was not found');
  const encodedStart = message.indexOf('\r\n\r\n', partStart) + 4;
  const encodedEnd = message.indexOf('\r\n--', encodedStart);
  return Buffer.from(
    message.slice(encodedStart, encodedEnd).replace(/\r\n/g, ''),
    'base64'
  ).toString('utf8');
}

test('Gmail API configuration requires every OAuth and sender value', () => {
  assert.deepEqual(emailService.validateGmailApiSettings(settings), settings);
  for (const key of ['clientId', 'clientSecret', 'refreshToken', 'user', 'from']) {
    assert.throws(
      () => emailService.validateGmailApiSettings({ ...settings, [key]: '' }),
      /MAIL_PROVIDER=gmail_api requires/
    );
  }
});

test('Gmail API client uses OAuth2 refresh-token credentials', () => {
  let constructed;
  let credentials;
  const gmailClient = { users: { messages: { send: async () => ({ data: { id: 'message-id' } }) } } };
  const googleApi = {
    auth: {
      OAuth2: class {
        constructor(clientId, clientSecret) {
          constructed = { clientId, clientSecret };
        }
        setCredentials(value) {
          credentials = value;
        }
      },
    },
    gmail: ({ version, auth }) => {
      assert.equal(version, 'v1');
      assert.ok(auth);
      return gmailClient;
    },
  };

  assert.equal(emailService.createGmailApiClient(settings, googleApi), gmailClient);
  assert.deepEqual(constructed, { clientId: settings.clientId, clientSecret: settings.clientSecret });
  assert.deepEqual(credentials, { refresh_token: settings.refreshToken });
});

test('Gmail API sends a UTF-8 multipart plain-text and HTML message as base64url', async () => {
  let request;
  const gmailClient = {
    users: {
      messages: {
        send: async value => {
          request = value;
          return { data: { id: 'gmail-message-id' } };
        },
      },
    },
  };
  const resetUrl = 'https://app.example.edu/reset-password?token=redacted-test-token';
  const result = await emailService.sendWithGmailApi({
    email: 'student@student.hau.edu.ph',
    resetUrl,
    expiresInMinutes: 30,
  }, { settings, gmailClient });

  assert.deepEqual(result, { provider: 'gmail_api', accepted: true, messageIdPresent: true });
  assert.equal(request.userId, 'me');
  assert.equal(typeof request.requestBody.raw, 'string');
  assert.doesNotMatch(request.requestBody.raw, /[+/=]/);

  const message = decodeBase64Url(request.requestBody.raw);
  assert.match(message, /^From: SEA-IT-SOLVED <seaitsolved\.project@gmail\.com>\r\n/);
  assert.match(message, /To: student@student\.hau\.edu\.ph/);
  assert.match(message, /Subject: Reset your SEA-IT-SOLVED password/);
  assert.match(message, /Content-Type: multipart\/alternative/);
  assert.ok(decodeMimePart(message, 'text/plain').includes(resetUrl));
  assert.ok(decodeMimePart(message, 'text/html').includes(resetUrl));
});

test('shared provider selection routes password reset and verification through Gmail API', async () => {
  const original = {
    MAIL_PROVIDER: config.MAIL_PROVIDER,
    GOOGLE_CLIENT_ID: config.GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET: config.GOOGLE_CLIENT_SECRET,
    GOOGLE_REFRESH_TOKEN: config.GOOGLE_REFRESH_TOKEN,
    GMAIL_API_USER: config.GMAIL_API_USER,
    MAIL_FROM: config.MAIL_FROM,
  };
  const originalCreateTransport = nodemailer.createTransport;
  let smtpContacts = 0;
  nodemailer.createTransport = () => {
    smtpContacts += 1;
    throw new Error('SMTP must not be contacted for gmail_api');
  };
  let sends = 0;
  const gmailClient = {
    users: { messages: { send: async () => {
      sends += 1;
      return { data: { id: 'message-' + sends } };
    } } },
  };
  try {
    Object.assign(config, {
      MAIL_PROVIDER: 'gmail_api',
      GOOGLE_CLIENT_ID: settings.clientId,
      GOOGLE_CLIENT_SECRET: settings.clientSecret,
      GOOGLE_REFRESH_TOKEN: settings.refreshToken,
      GMAIL_API_USER: settings.user,
      MAIL_FROM: settings.from,
    });
    await emailService.sendPasswordResetEmail({
      email: 'student@student.hau.edu.ph',
      resetUrl: 'https://app.example.edu/reset-password?token=redacted',
      expiresInMinutes: 30,
    }, { gmailClient });
    await emailService.sendStudentVerificationEmail({
      email: 'professor@hau.edu.ph',
      verificationUrl: 'https://app.example.edu/verify-email?token=redacted',
      expiresInMinutes: 60,
      role: 'INSTRUCTOR',
      accountStatus: 'PENDING',
    }, { gmailClient });
    assert.equal(sends, 2);
    assert.equal(smtpContacts, 0);
  } finally {
    nodemailer.createTransport = originalCreateTransport;
    Object.assign(config, original);
  }
});

test('Gmail API failures expose only redacted diagnostics', async () => {
  const secrets = [
    settings.clientSecret,
    settings.refreshToken,
    'verification-token-secret',
    '<p>private email contents</p>',
  ];
  const providerError = new Error('failure ' + secrets.join(' '));
  providerError.name = settings.clientSecret;
  providerError.code = settings.refreshToken;
  providerError.response = { status: 401, data: secrets.join(' ') };
  const gmailClient = {
    users: { messages: { send: async () => { throw providerError; } } },
  };
  const entries = [];
  const originalInfo = console.info;
  const originalError = console.error;
  console.info = (...values) => entries.push(values.join(' '));
  console.error = (...values) => entries.push(values.join(' '));
  try {
    await assert.rejects(
      () => emailService.sendWithGmailApi({
        email: 'student@student.hau.edu.ph',
        verificationUrl: 'https://app.example.edu/verify-email?token=verification-token-secret',
        expiresInMinutes: 60,
      }, { settings, gmailClient }),
      error => error.message === 'Gmail API email request failed.'
        && error.name === 'GmailApiError'
        && error.statusCode === 401
    );
  } finally {
    console.info = originalInfo;
    console.error = originalError;
  }
  const logs = entries.join('\n');
  for (const secret of secrets) assert.equal(logs.includes(secret), false);
  assert.match(logs, /Gmail API error status: 401/);
});

test('existing Resend and Gmail SMTP transports remain usable', async () => {
  const resendResult = await emailService.sendWithResend({
    email: 'student@student.hau.edu.ph',
    resetUrl: 'https://app.example.edu/reset-password?token=redacted',
    expiresInMinutes: 30,
  }, {
    settings: { apiKey: 'test-resend-key', from: 'SEA-IT-SOLVED <no-reply@example.edu>' },
    resendClient: { emails: { send: async () => ({ data: { id: 'resend-id' } }) } },
  });
  assert.equal(resendResult.provider, 'resend');

  const smtpResult = await emailService.sendWithGmailSmtp({
    email: 'student@student.hau.edu.ph',
    resetUrl: 'https://app.example.edu/reset-password?token=redacted',
    expiresInMinutes: 30,
  }, {
    settings: { user: 'sender@gmail.com', appPassword: 'test-app-password', from: 'SEA-IT-SOLVED <sender@gmail.com>' },
    transporter: { sendMail: async () => ({ accepted: ['student@student.hau.edu.ph'], rejected: [], messageId: 'smtp-id', response: '250 OK' }) },
  });
  assert.equal(smtpResult.provider, 'gmail_smtp');
});
