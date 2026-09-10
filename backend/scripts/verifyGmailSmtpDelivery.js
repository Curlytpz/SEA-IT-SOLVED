const config = require('../src/config/env');
const pool = require('../src/db/pool');
const emailService = require('../src/services/email.service');

function safeToken(value, fallback = 'UNKNOWN') {
  return String(value || fallback).replace(/[^A-Za-z0-9_.-]/g, '').slice(0, 80) || fallback;
}

async function main() {
  emailService.validateEmailConfiguration('gmail_smtp');

  const account = await pool.query(
    `SELECT email FROM users
     WHERE role='STUDENT' AND LOWER(email) LIKE '%@student.hau.edu.ph'
     LIMIT 1`
  );
  console.log(`[SMTP Test] Registered HAU recipient found: ${account.rows.length ? 'YES' : 'NO'}`);
  if (!account.rows.length) throw new Error('No registered HAU Student account is available.');

  const settings = {
    user: config.GMAIL_SMTP_USER,
    appPassword: config.GMAIL_SMTP_APP_PASSWORD,
    from: config.MAIL_FROM,
  };
  const transporter = emailService.createGmailSmtpTransport(settings);
  const result = await transporter.sendMail({
    from: emailService.gmailFromHeader(settings),
    to: account.rows[0].email,
    subject: 'SEA-IT-SOLVED SMTP Test',
    text: 'This is a test email from the SEA-IT-SOLVED backend.',
    html: '<p>This is a test email from the SEA-IT-SOLVED backend.</p>',
  });

  console.log(`[SMTP Test] Accepted count: ${Array.isArray(result.accepted) ? result.accepted.length : 0}`);
  console.log(`[SMTP Test] Rejected count: ${Array.isArray(result.rejected) ? result.rejected.length : 0}`);
  console.log(`[SMTP Test] Message ID present: ${result.messageId ? 'YES' : 'NO'}`);
  console.log(`[SMTP Test] Response category: ${emailService.smtpResponseCategory(result)}`);
}

main()
  .catch(error => {
    console.error(`[SMTP Test] Error code: ${safeToken(error?.code)}`);
    console.error(`[SMTP Test] Error name: ${safeToken(error?.name, 'Error')}`);
    console.error(`[SMTP Test] Response category: ${emailService.smtpResponseCategory(error)}`);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
