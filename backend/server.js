require('dotenv').config();
const config = require('./src/config/env');

// TEMPORARY startup diagnostics. Never print credential or token values here.
const mailProvider = String(config.MAIL_PROVIDER || '').trim().toLowerCase()
  || (config.NODE_ENV === 'development' ? 'development' : 'unconfigured');
console.log(`[Mail] Provider: ${mailProvider}`);
if (mailProvider === 'gmail_smtp') {
  console.log(`[Mail] Gmail SMTP user configured: ${config.GMAIL_SMTP_USER ? 'YES' : 'NO'}`);
  console.log(`[Mail] Gmail app password configured: ${config.GMAIL_SMTP_APP_PASSWORD ? 'YES' : 'NO'}`);
  console.log(`[Mail] Sender configured: ${config.MAIL_FROM ? 'YES' : 'NO'}`);
} else if (mailProvider === 'resend') {
  console.log(`[Mail] Resend API key configured: ${config.RESEND_API_KEY ? 'YES' : 'NO'}`);
  console.log(`[Mail] Sender configured: ${config.MAIL_FROM ? 'YES' : 'NO'}`);
}

const app  = require('./src/app');
const pool = require('./src/db/pool');
const { PORT } = config;

async function start() {
  // Verify DB connection before accepting traffic
  try {
    const client = await pool.connect();
    await client.query('SELECT 1');
    client.release();
    console.log('[DB] PostgreSQL connected.');
  } catch (err) {
    console.error('[DB] Could not connect to PostgreSQL:', err.message);
    console.error('Make sure PostgreSQL is running and your .env is configured.');
    process.exit(1);
  }

  app.listen(PORT, () => {
    console.log(`[Server] SEA-IT-SOLVED API running on http://localhost:${PORT}`);
  });
}

start();
