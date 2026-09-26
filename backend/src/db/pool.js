const { Pool } = require('pg');
const fs = require('node:fs');
const path = require('node:path');

const BACKEND_ROOT = path.resolve(__dirname, '..', '..');
const MAX_CA_FILE_BYTES = 1024 * 1024;

function parseDbSsl(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized || normalized === 'false') return false;
  if (normalized === 'true') return true;
  throw new Error('DB_SSL must be true or false.');
}

function loadDbSslCa(configuredPath) {
  const resolvedPath = path.isAbsolute(configuredPath)
    ? configuredPath
    : path.resolve(BACKEND_ROOT, configuredPath);

  try {
    const stats = fs.statSync(resolvedPath);
    if (!stats.isFile() || stats.size <= 0 || stats.size > MAX_CA_FILE_BYTES) {
      throw new Error('Invalid CA certificate file.');
    }

    const certificate = fs.readFileSync(resolvedPath, 'utf8');
    if (!certificate.includes('-----BEGIN CERTIFICATE-----')
        || !certificate.includes('-----END CERTIFICATE-----')) {
      throw new Error('Invalid CA certificate format.');
    }
    return certificate;
  } catch {
    throw new Error('Unable to load the DB_SSL_CA_PATH certificate.');
  }
}

function buildPoolConfig(environment = process.env) {
  const sslEnabled = parseDbSsl(environment.DB_SSL);
  const configuredCaPath = String(environment.DB_SSL_CA_PATH || '').trim();
  const ssl = sslEnabled
    ? {
        rejectUnauthorized: true,
        ...(configuredCaPath ? { ca: loadDbSslCa(configuredCaPath) } : {}),
      }
    : false;

  return {
    host:     environment.DB_HOST     || 'localhost',
    port:     parseInt(environment.DB_PORT || '5432', 10),
    database: environment.DB_NAME     || 'sea_it_solved',
    user:     environment.DB_USER     || 'postgres',
    password: environment.DB_PASSWORD || '',
    ssl,
    // Keep a reasonable pool size — Pi 4 is memory-constrained
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
  };
}

const pool = new Pool(buildPoolConfig());

pool.on('error', (err) => {
  console.error('[DB] Unexpected pool error:', err.message);
});

module.exports = pool;
module.exports.buildPoolConfig = buildPoolConfig;
