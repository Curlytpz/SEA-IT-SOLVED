const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const bcrypt = require('bcryptjs');
const config = require('../src/config/env');
const pool = require('../src/db/pool');
const auth = require('../src/services/auth.service');

async function main() {
  const migration = await fs.readFile(
    path.resolve(__dirname, '../src/db/migration_successful_login_count.sql'),
    'utf8'
  );
  await pool.query(migration);

  const suffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  const domain = config.STUDENT_EMAIL_DOMAIN || 'example.edu';
  const email = `first-login-${suffix}@${domain}`;
  const password = 'FirstLoginTest!42';
  const passwordHash = await bcrypt.hash(password, 4);
  let studentId;

  try {
    const inserted = await pool.query(
      `INSERT INTO users
         (first_name, last_name, email, student_number, password_hash, role, status)
       VALUES ('Greeting', 'Test', $1, $2, $3, 'STUDENT', 'ACTIVE')
       RETURNING id, successful_login_count`,
      [email, `GREETING-${suffix}`, passwordHash]
    );
    studentId = inserted.rows[0].id;
    assert.equal(inserted.rows[0].successful_login_count, 0, 'account creation must not count as a login');

    const first = await auth.login({ email, password, expectedRole: 'STUDENT' });
    assert.equal(first.user.successfulLoginCount, 1, 'first successful login must return count 1');

    await assert.rejects(
      auth.login({ email, password: 'wrong-password', expectedRole: 'STUDENT' }),
      /Incorrect email or password/
    );
    const afterFailure = await auth.getMe(studentId);
    assert.equal(afterFailure.successfulLoginCount, 1, 'failed login must not advance the count');

    const second = await auth.login({ email, password, expectedRole: 'STUDENT' });
    assert.equal(second.user.successfulLoginCount, 2, 'second successful login must return count 2');

    console.log('Student first-login server contract passed.');
  } finally {
    if (studentId) await pool.query('DELETE FROM users WHERE id = $1', [studentId]);
    await pool.end();
  }
}

main().catch(async error => {
  console.error(error);
  await pool.end().catch(() => {});
  process.exitCode = 1;
});
