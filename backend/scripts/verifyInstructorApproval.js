const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const bcrypt = require('bcryptjs');
const config = require('../src/config/env');
const pool = require('../src/db/pool');
const { signToken } = require('../src/utils/jwt');

async function request(base, method, path, { body, token } = {}) {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return { status: response.status, body: await response.json() };
}

async function main() {
  const suffix = crypto.randomBytes(6).toString('hex');
  const password = 'CorrectPass123!';
  const passwordHash = await bcrypt.hash(password, 4);
  const instructorDomain = config.INSTRUCTOR_EMAIL_DOMAIN || 'hau.edu.ph';
  const studentDomain = config.STUDENT_EMAIL_DOMAIN || 'student.hau.edu.ph';
  const studentEmail = `approval-student-${suffix}@${studentDomain}`;
  const adminEmail = `approval-admin-${suffix}@hau.edu.ph`;
  const pendingEmail = `approval-pending-${suffix}@${instructorDomain}`;
  const rejectedEmail = `approval-reject-${suffix}@${instructorDomain}`;
  const userIds = [];
  let server;

  try {
    const { rows: adminRows } = await pool.query(
      `INSERT INTO users (first_name, last_name, email, password_hash, role, status)
       VALUES ('Approval', 'Test', $1, $2, 'ADMIN', 'ACTIVE') RETURNING id`,
      [adminEmail, passwordHash]
    );
    userIds.push(adminRows[0].id);

    const app = require('../src/app');
    server = app.listen(0);
    await new Promise(resolve => server.once('listening', resolve));
    const base = `http://127.0.0.1:${server.address().port}/api`;

    const studentRegistration = await request(base, 'POST', '/auth/register/student', {
      body: {
        firstName: 'Approval',
        lastName: 'Test',
        email: studentEmail,
        studentNumber: `APPROVAL-${suffix}`,
        password,
      },
    });
    const studentId = studentRegistration.body?.data?.user?.id;
    if (studentId) userIds.push(studentId);
    assert.equal(studentRegistration.status, 201);
    assert.equal(studentRegistration.body.data.user.role, 'STUDENT');
    assert.equal(studentRegistration.body.data.user.status, 'ACTIVE');
    assert.equal(studentRegistration.body.data.token, undefined);

    const register = email => request(base, 'POST', '/auth/register/instructor', {
      body: { firstName: 'Approval', lastName: 'Test', email, password },
    });
    const pendingRegistration = await register(pendingEmail);
    const pendingId = pendingRegistration.body?.data?.user?.id;
    if (pendingId) userIds.push(pendingId);
    assert.equal(pendingRegistration.status, 201);
    assert.equal(pendingRegistration.body.data.user.role, 'INSTRUCTOR');
    assert.equal(pendingRegistration.body.data.user.status, 'PENDING');
    assert.equal(pendingRegistration.body.data.token, undefined);

    const rejectedRegistration = await register(rejectedEmail);
    const rejectedId = rejectedRegistration.body?.data?.user?.id;
    if (rejectedId) userIds.push(rejectedId);
    assert.equal(rejectedRegistration.status, 201);
    assert.equal(rejectedRegistration.body.data.user.status, 'PENDING');

    const login = (email, candidatePassword, expectedRole) =>
      request(base, 'POST', '/auth/login', { body: { email, password: candidatePassword, expectedRole } });

    const studentLogin = await login(studentEmail, password, 'STUDENT');
    assert.equal(studentLogin.status, 200);
    assert.equal(studentLogin.body.data.user.role, 'STUDENT');
    assert.equal(studentLogin.body.data.user.successfulLoginCount, 1);

    const adminLogin = await login(adminEmail, password, 'ADMIN');
    assert.equal(adminLogin.status, 200);
    const adminToken = adminLogin.body.data.token;

    const wrongPassword = await login(pendingEmail, 'WrongPass123!', 'INSTRUCTOR');
    assert.equal(wrongPassword.status, 401);
    assert.deepEqual(wrongPassword.body, { success: false, error: 'Incorrect email or password.' });

    const pendingLogin = await login(pendingEmail, password, 'INSTRUCTOR');
    assert.equal(pendingLogin.status, 403);
    assert.equal(pendingLogin.body.code, 'INSTRUCTOR_PENDING');
    assert.equal(pendingLogin.body.data?.token, undefined);
    const pendingCount = await pool.query('SELECT successful_login_count FROM users WHERE id=$1', [pendingId]);
    assert.equal(Number(pendingCount.rows[0].successful_login_count), 0);

    const legacyPendingToken = signToken({ id: pendingId, role: 'INSTRUCTOR', authVersion: 0 });
    const pendingMe = await request(base, 'GET', '/auth/me', { token: legacyPendingToken });
    assert.equal(pendingMe.status, 403);
    assert.equal(pendingMe.body.code, 'INSTRUCTOR_PENDING');
    const pendingApi = await request(base, 'GET', '/sections/instructor/sections', { token: legacyPendingToken });
    assert.equal(pendingApi.status, 403);
    assert.equal(pendingApi.body.code, 'INSTRUCTOR_PENDING');

    const queue = await request(base, 'GET', '/admin/instructors/pending', { token: adminToken });
    assert.equal(queue.status, 200);
    assert.ok(queue.body.data.instructors.some(instructor => instructor.id === pendingId));
    const approval = await request(base, 'PATCH', `/admin/instructors/${pendingId}/approve`, { token: adminToken });
    assert.equal(approval.status, 200);
    assert.equal(approval.body.data.user.status, 'ACTIVE');

    const oldPendingToken = await request(base, 'GET', '/auth/me', { token: legacyPendingToken });
    assert.equal(oldPendingToken.status, 401);
    const approvedLogin = await login(pendingEmail, password, 'INSTRUCTOR');
    assert.equal(approvedLogin.status, 200);
    assert.equal(approvedLogin.body.data.user.status, 'ACTIVE');
    const approvedToken = approvedLogin.body.data.token;

    const suspension = await request(base, 'PATCH', `/admin/users/${pendingId}/status`, {
      token: adminToken,
      body: { status: 'SUSPENDED' },
    });
    assert.equal(suspension.status, 200);
    const revokedApi = await request(base, 'GET', '/sections/instructor/sections', { token: approvedToken });
    assert.equal(revokedApi.status, 403);
    assert.equal(revokedApi.body.code, 'INSTRUCTOR_SUSPENDED');

    const reactivation = await request(base, 'PATCH', `/admin/users/${pendingId}/status`, {
      token: adminToken,
      body: { status: 'ACTIVE' },
    });
    assert.equal(reactivation.status, 200);
    const oldApprovedToken = await request(base, 'GET', '/auth/me', { token: approvedToken });
    assert.equal(oldApprovedToken.status, 401);
    const reactivatedLogin = await login(pendingEmail, password, 'INSTRUCTOR');
    assert.equal(reactivatedLogin.status, 200);

    const rejection = await request(base, 'PATCH', `/admin/instructors/${rejectedId}/reject`, { token: adminToken });
    assert.equal(rejection.status, 200);
    assert.equal(rejection.body.data.user.status, 'REJECTED');
    const rejectedLogin = await login(rejectedEmail, password, 'INSTRUCTOR');
    assert.equal(rejectedLogin.status, 403);
    assert.equal(rejectedLogin.body.code, 'INSTRUCTOR_REJECTED');
    assert.equal(rejectedLogin.body.data?.token, undefined);

    console.log('PASS registration creates pending instructors without a token');
    console.log('PASS wrong credentials do not reveal approval status');
    console.log('PASS pending login, /auth/me, and instructor APIs are denied');
    console.log('PASS admin approval enables a fresh instructor login, not an old token');
    console.log('PASS suspension and reactivation revoke existing instructor sessions');
    console.log('PASS rejected instructors cannot sign in');
    console.log('PASS student registration/login and admin login remain available');
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
