const pool = require('../db/pool');

const PROVIDER_KEY = 'GEMINI';
const ADVISORY_LOCK_NAMESPACE = 1397047625;

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

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

// PostgreSQL advisory locks make the concurrency cap effective across the API,
// recognition worker, and transcription worker (which run as separate Node
// processes). A crashed process automatically releases its connection locks.
async function acquireSlot(maxConcurrent) {
  const slotCount = Math.max(1, Number(maxConcurrent) || 1);
  while (true) {
    const client = await pool.connect();
    let acquired = false;
    try {
      for (let slot = 1; slot <= slotCount; slot += 1) {
        const result = await client.query(
          'SELECT pg_try_advisory_lock($1, $2) AS acquired',
          [ADVISORY_LOCK_NAMESPACE, slot]
        );
        if (!result.rows[0]?.acquired) continue;
        acquired = true;
        let released = false;
        return async () => {
          if (released) return;
          released = true;
          let releaseError = null;
          try {
            await client.query('SELECT pg_advisory_unlock($1, $2)', [ADVISORY_LOCK_NAMESPACE, slot]);
          } catch (error) {
            releaseError = error;
            console.error('[AIProvider] Failed to release provider concurrency slot', {
              slot,
              message: error.message,
            });
          } finally {
            client.release(releaseError || undefined);
          }
        };
      }
    } finally {
      // An acquired slot owns this connection until its release callback runs.
      if (!acquired) client.release();
    }
    await wait(250);
  }
}

module.exports = { reserveRequest, extendCooldown, acquireSlot };
