const pool = require('../db/pool');

const PROVIDER_KEY = 'GEMINI';

async function reserveRequest(minimumIntervalMs) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `INSERT INTO provider_request_throttles (provider_key, next_request_at)
       VALUES ($1, NOW()) ON CONFLICT (provider_key) DO NOTHING`,
      [PROVIDER_KEY]
    );
    const { rows } = await client.query(
      'SELECT next_request_at FROM provider_request_throttles WHERE provider_key = $1 FOR UPDATE',
      [PROVIDER_KEY]
    );
    const now = Date.now();
    const reservedAt = Math.max(now, new Date(rows[0].next_request_at).getTime());
    await client.query(
      `UPDATE provider_request_throttles
          SET next_request_at = TO_TIMESTAMP($2::double precision / 1000.0), updated_at = NOW()
        WHERE provider_key = $1`,
      [PROVIDER_KEY, reservedAt + minimumIntervalMs]
    );
    await client.query('COMMIT');
    return Math.max(0, reservedAt - now);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally { client.release(); }
}

async function extendCooldown(backoffMs) {
  await pool.query(
    `INSERT INTO provider_request_throttles (provider_key, next_request_at, updated_at)
     VALUES ($1, NOW() + ($2::bigint * INTERVAL '1 millisecond'), NOW())
     ON CONFLICT (provider_key) DO UPDATE
       SET next_request_at = GREATEST(provider_request_throttles.next_request_at, EXCLUDED.next_request_at),
           updated_at = NOW()`,
    [PROVIDER_KEY, backoffMs]
  );
}

module.exports = { reserveRequest, extendCooldown };
