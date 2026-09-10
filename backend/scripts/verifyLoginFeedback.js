const assert = require('assert/strict');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
require('../src/config/env');
const pool = require('../src/db/pool');

async function postLogin(base, body) {
  const response = await fetch(`${base}/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: response.status, body: await response.json() };
}

async function main() {
  const suffix = crypto.randomBytes(6).toString('hex');
  const password = 'CorrectPass123!';
  const passwordHash = await bcrypt.hash(password, 4);
  const accounts = [
    { email: `login-${suffix}@student.hau.edu.ph`, role: 'STUDENT', status: 'ACTIVE' },
    { email: `pending-${suffix}@hau.edu.ph`, role: 'INSTRUCTOR', status: 'PENDING' },
    { email: `suspended-${suffix}@hau.edu.ph`, role: 'INSTRUCTOR', status: 'SUSPENDED' },
    { email: `rejected-${suffix}@hau.edu.ph`, role: 'INSTRUCTOR', status: 'REJECTED' },
  ];
  const userIds = [];
  let server;

  try {
    for (const account of accounts) {
      const { rows } = await pool.query(
        `INSERT INTO users(first_name,last_name,email,password_hash,role,status)
         VALUES('Login','Feedback Test',$1,$2,$3,$4) RETURNING id`,
        [account.email, passwordHash, account.role, account.status]
      );
      userIds.push(rows[0].id);
    }

    const app = require('../src/app');
    server = app.listen(0);
    await new Promise(resolve => server.once('listening', resolve));
    const base = `http://127.0.0.1:${server.address().port}/api/auth`;

    const wrongPassword = await postLogin(base, {
      email: accounts[0].email,
      password: 'WrongPass123!',
      expectedRole: 'STUDENT',
    });
    const unknownEmail = await postLogin(base, {
      email: `unknown-${suffix}@student.hau.edu.ph`,
      password: 'WrongPass123!',
      expectedRole: 'STUDENT',
    });
    const expectedCredentialFailure = { success: false, error: 'Incorrect email or password.' };
    assert.equal(wrongPassword.status, 401);
    assert.equal(unknownEmail.status, 401);
    assert.deepEqual(wrongPassword.body, expectedCredentialFailure);
    assert.deepEqual(unknownEmail.body, expectedCredentialFailure);

    const valid = await postLogin(base, {
      email: accounts[0].email,
      password,
      expectedRole: 'STUDENT',
    });
    assert.equal(valid.status, 200);
    assert.equal(valid.body.data.user.role, 'STUDENT');

    const pending = await postLogin(base, {
      email: accounts[1].email,
      password,
      expectedRole: 'INSTRUCTOR',
    });
    assert.equal(pending.status, 200);
    assert.equal(pending.body.data.user.status, 'PENDING');

    const suspended = await postLogin(base, {
      email: accounts[2].email,
      password,
      expectedRole: 'INSTRUCTOR',
    });
    assert.equal(suspended.status, 403);
    assert.match(suspended.body.error, /suspended/i);
    assert.notEqual(suspended.body.error, expectedCredentialFailure.error);

    const rejected = await postLogin(base, {
      email: accounts[3].email,
      password,
      expectedRole: 'INSTRUCTOR',
    });
    assert.equal(rejected.status, 403);
    assert.match(rejected.body.error, /rejected/i);
    assert.notEqual(rejected.body.error, expectedCredentialFailure.error);

    console.log('PASS wrong password returns the generic credential message');
    console.log('PASS unknown email returns the identical generic credential message');
    console.log('PASS valid credentials authenticate successfully');
    console.log('PASS pending instructor retains the approval-state flow');
    console.log('PASS suspended and rejected instructors retain specific account-state messages');
  } finally {
    if (server) await new Promise(resolve => server.close(resolve));
    if (userIds.length) await pool.query('DELETE FROM users WHERE id=ANY($1::uuid[])', [userIds]);
    await pool.end();
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
