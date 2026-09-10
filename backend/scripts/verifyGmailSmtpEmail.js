const assert = require('assert/strict');
const config = require('../src/config/env');
const emailService = require('../src/services/email.service');

async function main() {
  const original = {
    NODE_ENV: config.NODE_ENV,
    MAIL_PROVIDER: config.MAIL_PROVIDER,
    GMAIL_SMTP_USER: config.GMAIL_SMTP_USER,
    GMAIL_SMTP_APP_PASSWORD: config.GMAIL_SMTP_APP_PASSWORD,
    MAIL_FROM: config.MAIL_FROM,
  };
  const originalInfo = console.info;

  try {
    config.NODE_ENV = 'development';
    config.MAIL_PROVIDER = 'development';
    const developmentLogs = [];
    console.info = message => developmentLogs.push(String(message));
    await emailService.sendPasswordResetEmail({
      email: 'student@student.hau.edu.ph',
      resetUrl: 'http://localhost:5173/reset-password?token=development-test-token',
      expiresInMinutes: 30,
    });
    assert.match(developmentLogs.join('\n'), /Provider selected: development/);
    assert.match(developmentLogs.join('\n'), /development-test-token/);

    config.NODE_ENV = 'production';
    config.MAIL_PROVIDER = 'gmail_smtp';
    config.GMAIL_SMTP_USER = '';
    config.GMAIL_SMTP_APP_PASSWORD = '';
    config.MAIL_FROM = '';
    assert.throws(
      () => emailService.validateEmailConfiguration(),
      error => /MAIL_PROVIDER=gmail_smtp requires/.test(error.message)
        && /GMAIL_SMTP_USER/.test(error.message)
        && /GMAIL_SMTP_APP_PASSWORD/.test(error.message)
        && /MAIL_FROM/.test(error.message)
    );

    const settings = {
      user: 'prototype.sender@gmail.com',
      appPassword: 'mock-app-password',
      from: 'SEA-IT-SOLVED <prototype.sender@gmail.com>',
    };
    let smtpOptions;
    const mockTransport = { sendMail: async () => ({ accepted: [], messageId: null }) };
    const transport = emailService.createGmailSmtpTransport(settings, options => {
      smtpOptions = options;
      return mockTransport;
    });
    assert.equal(transport, mockTransport);
    assert.deepEqual(smtpOptions, {
      host: 'smtp.gmail.com',
      port: 587,
      secure: false,
      requireTLS: true,
      auth: {
        user: settings.user,
        pass: settings.appPassword,
      },
      tls: { minVersion: 'TLSv1.2' },
    });

    const recipient = 'name@student.hau.edu.ph';
    const resetUrl = 'https://app.example/reset-password?token=mock-reset-token';
    const deliveries = [];
    const transporter = {
      sendMail: async payload => {
        deliveries.push(payload);
        return {
          accepted: [recipient],
          rejected: [],
          messageId: 'mock-message-id',
          response: '250 2.0.0 OK',
        };
      },
    };

    const result = await emailService.sendWithGmailSmtp(
      { email: recipient, resetUrl, expiresInMinutes: 30 },
      { settings, transporter }
    );
    assert.equal(deliveries.length, 1);
    assert.equal(deliveries[0].from, settings.from);
    assert.equal(deliveries[0].to, recipient);
    assert.equal(deliveries[0].subject, 'Reset your SEA-IT-SOLVED password');
    assert.match(deliveries[0].html, /SEA-IT-SOLVED/);
    assert.match(deliveries[0].html, /Reset your password/);
    assert.match(deliveries[0].html, /mock-reset-token/);
    assert.match(deliveries[0].html, /expires in 30 minutes/i);
    assert.doesNotMatch(deliveries[0].html, /<img|<svg|<script|<form|style=|https?:\/\/(?!app\.example)/i);
    assert.match(deliveries[0].text, /SEA-IT-SOLVED Password Reset/);
    assert.match(deliveries[0].text, /mock-reset-token/);
    assert.equal(
      emailService.gmailFromHeader({ user: settings.user, from: 'Different Sender <other@example.com>' }),
      'SEA-IT-SOLVED <prototype.sender@gmail.com>'
    );
    assert.equal(emailService.smtpResponseCategory({ response: '250 2.0.0 OK' }), '250');
    assert.deepEqual(result, {
      provider: 'gmail_smtp',
      accepted: true,
      messageIdPresent: true,
    });
    assert.doesNotMatch(JSON.stringify(result), /mock-app-password|mock-reset-token/);

    await assert.rejects(
      () => emailService.sendWithGmailSmtp(
        { email: recipient, resetUrl, expiresInMinutes: 30 },
        {
          settings,
          transporter: {
            sendMail: async () => {
              const error = new Error(`authentication failed ${settings.appPassword} ${resetUrl}`);
              error.code = 'EAUTH';
              error.responseCode = 535;
              throw error;
            },
          },
        }
      ),
      error => error.message === 'Gmail SMTP password reset email request failed.'
        && error.name === 'EAUTH'
        && error.statusCode === 535
        && !/mock-app-password|mock-reset-token/.test(error.message)
    );

    await assert.rejects(
      () => emailService.sendWithGmailSmtp(
        { email: recipient, resetUrl, expiresInMinutes: 30 },
        {
          settings,
          transporter: {
            sendMail: async () => ({ accepted: [], rejected: [recipient] }),
          },
        }
      ),
      error => error.message === 'Gmail SMTP did not accept the password reset email.'
        && !/mock-app-password|mock-reset-token/.test(error.message)
    );

    console.info = originalInfo;
    console.log('PASS development reset-link transport remains available');
    console.log('PASS gmail_smtp missing configuration fails safely');
    console.log('PASS Gmail SMTP host, STARTTLS, authentication, and TLS settings');
    console.log('PASS Gmail SMTP sender, HAU recipient, subject, and reset email content');
    console.log('PASS Gmail SMTP accepted response handling');
    console.log('PASS Gmail SMTP errors and transport results do not expose credentials or reset tokens');
  } finally {
    console.info = originalInfo;
    Object.assign(config, original);
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
