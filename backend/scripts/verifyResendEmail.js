const assert = require('assert/strict');
const config = require('../src/config/env');
const emailService = require('../src/services/email.service');

async function main() {
  const original = {
    NODE_ENV: config.NODE_ENV,
    MAIL_PROVIDER: config.MAIL_PROVIDER,
    RESEND_API_KEY: config.RESEND_API_KEY,
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
    config.MAIL_PROVIDER = 'resend';
    config.RESEND_API_KEY = '';
    config.MAIL_FROM = '';
    assert.throws(
      () => emailService.validateEmailConfiguration(),
      error => /MAIL_PROVIDER=resend requires/.test(error.message)
        && /RESEND_API_KEY/.test(error.message)
        && /MAIL_FROM/.test(error.message)
    );

    const settings = {
      apiKey: 're_mock_api_key',
      from: 'SEA-IT-SOLVED <onboarding@resend.dev>',
    };
    const recipient = 'name@student.hau.edu.ph';
    const resetUrl = 'https://app.example/reset-password?token=mock-reset-token';
    const deliveries = [];
    const resendClient = {
      emails: {
        send: async payload => {
          deliveries.push(payload);
          return { data: { id: 'mock-email-id' }, error: null };
        },
      },
    };

    const result = await emailService.sendWithResend(
      { email: recipient, resetUrl, expiresInMinutes: 30 },
      { settings, resendClient }
    );
    assert.equal(deliveries.length, 1);
    assert.equal(deliveries[0].from, settings.from);
    assert.equal(deliveries[0].to, recipient);
    assert.equal(deliveries[0].subject, 'Reset your SEA-IT-SOLVED password');
    assert.match(deliveries[0].html, /SEA-IT-SOLVED/);
    assert.match(deliveries[0].html, /Reset your password/);
    assert.match(deliveries[0].html, /mock-reset-token/);
    assert.match(deliveries[0].html, /expires in 30 minutes/i);
    assert.match(deliveries[0].text, /mock-reset-token/);
    assert.deepEqual(result, { provider: 'resend', accepted: true, id: 'mock-email-id' });
    assert.doesNotMatch(JSON.stringify(result), /re_mock_api_key|mock-reset-token/);

    await assert.rejects(
      () => emailService.sendWithResend(
        { email: recipient, resetUrl, expiresInMinutes: 30 },
        {
          settings,
          resendClient: {
            emails: {
              send: async () => {
                throw new Error(`provider failure ${settings.apiKey} ${resetUrl}`);
              },
            },
          },
        }
      ),
      error => error.message === 'Resend password reset email request failed.'
        && !/re_mock_api_key|mock-reset-token/.test(error.message)
    );

    await assert.rejects(
      () => emailService.sendWithResend(
        { email: recipient, resetUrl, expiresInMinutes: 30 },
        {
          settings,
          resendClient: {
            emails: { send: async () => ({ data: null, error: { message: settings.apiKey } }) },
          },
        }
      ),
      error => error.message === 'Resend did not accept the password reset email.'
        && !/re_mock_api_key|mock-reset-token/.test(error.message)
    );

    console.info = originalInfo;
    console.log('PASS development reset-link transport remains available');
    console.log('PASS resend missing configuration fails safely');
    console.log('PASS Resend sender, HAU recipient, subject, and reset email content');
    console.log('PASS Resend accepted response handling');
    console.log('PASS Resend errors and transport results do not expose API keys or reset tokens');
  } finally {
    console.info = originalInfo;
    Object.assign(config, original);
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
