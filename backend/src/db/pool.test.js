const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const pool = require('./pool');

const { buildPoolConfig } = pool;
const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'sea-it-solved-db-ca-'));
const caPath = path.join(temporaryDirectory, 'supabase-ca.crt');
const caCertificate = [
  '-----BEGIN CERTIFICATE-----',
  'focused-test-certificate',
  '-----END CERTIFICATE-----',
  '',
].join('\n');

fs.writeFileSync(caPath, caCertificate, { encoding: 'utf8', mode: 0o600 });

test.after(async () => {
  await pool.end();
  fs.rmSync(temporaryDirectory, { recursive: true, force: true });
});

test('local PostgreSQL remains non-SSL by default', () => {
  const config = buildPoolConfig({});

  assert.equal(config.host, 'localhost');
  assert.equal(config.ssl, false);
});

test('DB_SSL enables certificate-verified PostgreSQL TLS', () => {
  const config = buildPoolConfig({
    DB_HOST: 'aws-0-ap-southeast-1.pooler.supabase.com',
    DB_PORT: '5432',
    DB_NAME: 'postgres',
    DB_USER: 'postgres.project-ref',
    DB_PASSWORD: 'not-logged-or-exposed',
    DB_SSL: 'true',
  });

  assert.equal(config.ssl.rejectUnauthorized, true);
  assert.equal(config.host, 'aws-0-ap-southeast-1.pooler.supabase.com');
  assert.equal(config.port, 5432);
});

test('DB_SSL_CA_PATH adds a trusted CA without weakening verification', () => {
  const backendRoot = path.resolve(__dirname, '..', '..');
  const config = buildPoolConfig({
    DB_SSL: 'true',
    DB_SSL_CA_PATH: path.relative(backendRoot, caPath),
  });

  assert.equal(config.ssl.rejectUnauthorized, true);
  assert.equal(config.ssl.ca, caCertificate);
});

test('DB_SSL=false does not load a configured CA path', () => {
  const config = buildPoolConfig({
    DB_SSL: 'false',
    DB_SSL_CA_PATH: path.join(temporaryDirectory, 'missing.crt'),
  });

  assert.equal(config.ssl, false);
});

test('an unreadable or invalid CA certificate fails closed without exposing contents', () => {
  const invalidPath = path.join(temporaryDirectory, 'invalid.crt');
  const invalidContents = 'sensitive-invalid-certificate-contents';
  fs.writeFileSync(invalidPath, invalidContents, { encoding: 'utf8', mode: 0o600 });

  assert.throws(
    () => buildPoolConfig({ DB_SSL: 'true', DB_SSL_CA_PATH: invalidPath }),
    error => error.message === 'Unable to load the DB_SSL_CA_PATH certificate.'
      && !error.message.includes(invalidContents)
  );
});

test('invalid DB_SSL values fail closed', () => {
  assert.throws(
    () => buildPoolConfig({ DB_SSL: 'prefer' }),
    /DB_SSL must be true or false/
  );
});
