const test = require('node:test');
const assert = require('node:assert/strict');
const { validateProductionConfiguration } = require('./env');

const productionEnvironment = { DB_PASSWORD: 'configured', TRUST_PROXY_HOPS: '1' };

function productionConfig(overrides = {}) {
  return {
    NODE_ENV: 'production',
    DB_HOST: 'db.example.edu',
    DB_SSL: false,
    JWT_SECRET: 'x'.repeat(32),
    FRONTEND_URL: 'https://app.example.edu',
    GEMINI_API_KEY: 'configured',
    MAIL_PROVIDER: 'resend',
    RESEND_API_KEY: 'configured',
    MAIL_FROM: 'SEA-IT-SOLVED <no-reply@example.edu>',
    TRANSCRIPTION_PROVIDER_TIMEOUT_MS: 600000,
    TRANSCRIPTION_FFMPEG_TIMEOUT_MS: 240000,
    TRANSCRIPTION_JOB_TIMEOUT_MS: 1000000,
    ...overrides,
  };
}

test('production configuration fails closed on unsafe secrets, URLs, mail, and proxy topology', () => {
  assert.throws(() => validateProductionConfiguration({
    NODE_ENV: 'production', JWT_SECRET: 'short', FRONTEND_URL: 'http://localhost:5173', GEMINI_API_KEY: '', MAIL_PROVIDER: 'development',
  }, {}), /Unsafe production configuration/);
});

test('complete production configuration passes validation', () => {
  assert.doesNotThrow(() => validateProductionConfiguration(productionConfig(), productionEnvironment));
});

test('production Supabase configuration requires database SSL', () => {
  const supabaseConfig = productionConfig({
    DB_HOST: 'aws-0-ap-southeast-1.pooler.supabase.com',
  });

  assert.throws(
    () => validateProductionConfiguration(supabaseConfig, productionEnvironment),
    /DB_SSL=true is required for Supabase PostgreSQL connections/
  );
  assert.doesNotThrow(() => validateProductionConfiguration({
    ...supabaseConfig,
    DB_SSL: true,
  }, productionEnvironment));
});

test('production resend configuration requires its API key and sender', () => {
  assert.throws(
    () => validateProductionConfiguration(productionConfig({ RESEND_API_KEY: '' }), productionEnvironment),
    /RESEND_API_KEY/
  );
  const secretValue = 'sensitive-resend-key-value';
  assert.throws(
    () => validateProductionConfiguration(productionConfig({ RESEND_API_KEY: secretValue, MAIL_FROM: '' }), productionEnvironment),
    error => error.message.includes('MAIL_FROM') && !error.message.includes(secretValue)
  );
});

test('production rejects unsupported mail providers', () => {
  assert.throws(
    () => validateProductionConfiguration(productionConfig({ MAIL_PROVIDER: 'custom_mailer' }), productionEnvironment),
    /MAIL_PROVIDER must be resend, gmail_smtp, or microsoft_graph/
  );
});

test('production gmail SMTP configuration requires its existing credentials and sender', () => {
  const valid = productionConfig({
    MAIL_PROVIDER: 'gmail_smtp',
    GMAIL_SMTP_USER: 'teacher@example.edu',
    GMAIL_SMTP_APP_PASSWORD: 'configured',
  });
  assert.doesNotThrow(() => validateProductionConfiguration(valid, productionEnvironment));
  for (const name of ['GMAIL_SMTP_USER', 'GMAIL_SMTP_APP_PASSWORD', 'MAIL_FROM']) {
    assert.throws(
      () => validateProductionConfiguration({ ...valid, [name]: '' }, productionEnvironment),
      new RegExp(name)
    );
  }
});

test('production Microsoft Graph configuration requires its existing credentials and sender', () => {
  const valid = productionConfig({
    MAIL_PROVIDER: 'microsoft_graph',
    MICROSOFT_TENANT_ID: 'configured',
    MICROSOFT_CLIENT_ID: 'configured',
    MICROSOFT_CLIENT_SECRET: 'configured',
    MICROSOFT_SENDER_EMAIL: 'no-reply@example.edu',
  });
  assert.doesNotThrow(() => validateProductionConfiguration(valid, productionEnvironment));
  for (const name of ['MICROSOFT_TENANT_ID', 'MICROSOFT_CLIENT_ID', 'MICROSOFT_CLIENT_SECRET', 'MICROSOFT_SENDER_EMAIL']) {
    assert.throws(
      () => validateProductionConfiguration({ ...valid, [name]: '' }, productionEnvironment),
      new RegExp(name)
    );
  }
});

test('development configuration remains usable without production mail credentials', () => {
  assert.doesNotThrow(() => validateProductionConfiguration({
    NODE_ENV: 'development',
    MAIL_PROVIDER: 'development',
  }, {}));
});

test('production rejects a stale-job timeout shorter than the complete media pipeline budget', () => {
  assert.throws(
    () => validateProductionConfiguration(productionConfig({ TRANSCRIPTION_JOB_TIMEOUT_MS: 800000 }), productionEnvironment),
    /TRANSCRIPTION_JOB_TIMEOUT_MS/
  );
});
