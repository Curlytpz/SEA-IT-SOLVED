const assert = require('assert/strict');
const config = require('../src/config/env');
const emailService = require('../src/services/email.service');

async function main() {
  const original = {
    NODE_ENV: config.NODE_ENV,
    MAIL_PROVIDER: config.MAIL_PROVIDER,
    MICROSOFT_TENANT_ID: config.MICROSOFT_TENANT_ID,
    MICROSOFT_CLIENT_ID: config.MICROSOFT_CLIENT_ID,
    MICROSOFT_CLIENT_SECRET: config.MICROSOFT_CLIENT_SECRET,
    MICROSOFT_SENDER_EMAIL: config.MICROSOFT_SENDER_EMAIL,
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
    assert.match(developmentLogs.join('\n'), /SEA-IT-SOLVED PASSWORD RESET/);
    assert.match(developmentLogs.join('\n'), /development-test-token/);

    config.NODE_ENV = 'production';
    config.MAIL_PROVIDER = 'microsoft_graph';
    config.MICROSOFT_TENANT_ID = '';
    config.MICROSOFT_CLIENT_ID = '';
    config.MICROSOFT_CLIENT_SECRET = '';
    config.MICROSOFT_SENDER_EMAIL = '';
    assert.throws(
      () => emailService.validateEmailConfiguration(),
      error => /MAIL_PROVIDER=microsoft_graph requires/.test(error.message)
        && /MICROSOFT_TENANT_ID/.test(error.message)
        && /MICROSOFT_CLIENT_ID/.test(error.message)
        && /MICROSOFT_CLIENT_SECRET/.test(error.message)
        && /MICROSOFT_SENDER_EMAIL/.test(error.message)
    );

    const settings = {
      tenantId: 'mock-tenant-id',
      clientId: 'mock-client-id',
      clientSecret: 'mock-client-secret',
      senderEmail: 'mailer@hau.edu.ph',
    };
    const recipient = 'student@student.hau.edu.ph';
    const resetUrl = 'https://app.example/reset-password?token=mock-reset-token';
    const accessRequests = [];
    const confidentialClient = {
      acquireTokenByClientCredential: async request => {
        accessRequests.push(request);
        return { accessToken: 'mock-access-token' };
      },
    };
    const graphRequests = [];
    const fetchImpl = async (url, options) => {
      graphRequests.push({ url, options });
      return { ok: true, status: 202 };
    };

    const result = await emailService.sendWithMicrosoftGraph(
      { email: recipient, resetUrl, expiresInMinutes: 30 },
      { settings, confidentialClient, fetchImpl }
    );
    assert.deepEqual(accessRequests, [{ scopes: ['https://graph.microsoft.com/.default'] }]);
    assert.equal(graphRequests.length, 1);
    assert.equal(graphRequests[0].url, 'https://graph.microsoft.com/v1.0/users/mailer%40hau.edu.ph/sendMail');
    assert.equal(graphRequests[0].options.method, 'POST');
    assert.equal(graphRequests[0].options.headers.Authorization, 'Bearer mock-access-token');
    const graphBody = JSON.parse(graphRequests[0].options.body);
    assert.equal(graphBody.message.subject, 'Reset your SEA-IT-SOLVED password');
    assert.equal(graphBody.message.toRecipients[0].emailAddress.address, recipient);
    assert.match(graphBody.message.body.content, /SEA-IT-SOLVED/);
    assert.match(graphBody.message.body.content, /Reset your password/);
    assert.match(graphBody.message.body.content, /mock-reset-token/);
    assert.match(graphBody.message.body.content, /expires in 30 minutes/i);
    assert.deepEqual(result, { provider: 'microsoft_graph', accepted: true, status: 202 });
    assert.doesNotMatch(JSON.stringify(result), /mock-access-token|mock-client-secret|mock-reset-token/);

    await assert.rejects(
      () => emailService.sendWithMicrosoftGraph(
        { email: recipient, resetUrl, expiresInMinutes: 30 },
        {
          settings,
          confidentialClient,
          fetchImpl: async () => ({ ok: false, status: 503 }),
        }
      ),
      error => error.message === 'Microsoft Graph sendMail was rejected with status 503.'
        && !/mock-access-token|mock-client-secret|mock-reset-token/.test(error.message)
    );

    const productionLogs = [];
    console.info = message => productionLogs.push(String(message));
    assert.throws(
      () => emailService.sendWithDevelopmentTransport({
        email: recipient,
        resetUrl,
        expiresInMinutes: 30,
      }),
      /disabled outside development/
    );
    assert.equal(productionLogs.length, 0, 'Production must not log reset URLs.');

    console.info = originalInfo;
    console.log('PASS development reset-link transport remains available');
    console.log('PASS microsoft_graph missing configuration fails safely');
    console.log('PASS MSAL client-credentials scope and Graph sender endpoint');
    console.log('PASS Graph recipient and reset email body');
    console.log('PASS Graph 202 accepted response handling');
    console.log('PASS Graph failures and transport results do not expose secrets');
    console.log('PASS production reset URL logging is disabled');
  } finally {
    console.info = originalInfo;
    Object.assign(config, original);
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
