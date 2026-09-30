const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const bcrypt = require('bcryptjs');
const runSuffix = crypto.randomBytes(6).toString('hex');
const developmentInstructorTestEmail = `approval-dev-${runSuffix}@example.com`;
process.env.DEV_INSTRUCTOR_TEST_EMAIL = developmentInstructorTestEmail;
const config = require('../src/config/env');
const pool = require('../src/db/pool');
const { signToken } = require('../src/utils/jwt');
const fs = require('node:fs');
const path = require('node:path');
const emailService = require('../src/services/email.service');
const verificationDeliveries = [];
emailService.sendStudentVerificationEmail = async payload => { verificationDeliveries.push(payload); return { provider: 'test' }; };
const emailVerification = require('../src/services/email-verification.service');

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
  await pool.query(fs.readFileSync(path.join(__dirname, '../src/db/migration_student_email_verification.sql'), 'utf8'));
  const suffix = runSuffix;
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
    assert.equal(studentRegistration.body.data.user.status, 'PENDING');
    assert.equal(studentRegistration.body.data.token, undefined);
    const verificationCode = verificationDeliveries.at(-1).verificationCode;
    const verification = await request(base, 'POST', '/auth/verify-email', { body: { email: studentEmail, code: verificationCode } });
    assert.equal(verification.status, 200);

    const register = email => request(base, 'POST', '/auth/register/instructor', {
      body: { firstName: 'Approval', lastName: 'Test', email, password, role: 'ADMIN' },
    });
    const pendingRegistration = await register(pendingEmail);
    const pendingId = pendingRegistration.body?.data?.user?.id;
    if (pendingId) userIds.push(pendingId);
    assert.equal(pendingRegistration.status, 201);
    assert.equal(pendingRegistration.body.data.user.role, 'INSTRUCTOR');
    assert.equal(pendingRegistration.body.data.user.status, 'PENDING');
    assert.equal(pendingRegistration.body.data.verificationRequired, true);
    assert.equal(pendingRegistration.body.data.token, undefined);
    const pendingDelivery = verificationDeliveries.find(item => item.email === pendingEmail);
    assert.equal(pendingDelivery.role, 'INSTRUCTOR');
    let instructorVerificationCode = pendingDelivery.verificationCode;
    const pendingRow = await pool.query('SELECT status,email_verified_at FROM users WHERE id=$1', [pendingId]);
    assert.equal(pendingRow.rows[0].status, 'PENDING');
    assert.equal(pendingRow.rows[0].email_verified_at, null);

    const rejectedRegistration = await register(rejectedEmail);
    const rejectedId = rejectedRegistration.body?.data?.user?.id;
    if (rejectedId) userIds.push(rejectedId);
    assert.equal(rejectedRegistration.status, 201);
    assert.equal(rejectedRegistration.body.data.user.status, 'PENDING');

    const developmentRegistration = await register(developmentInstructorTestEmail);
    const developmentInstructorId = developmentRegistration.body?.data?.user?.id;
    if (developmentInstructorId) userIds.push(developmentInstructorId);
    assert.equal(developmentRegistration.status, 201);
    assert.equal(developmentRegistration.body.data.user.email, developmentInstructorTestEmail);
    assert.equal(developmentRegistration.body.data.user.role, 'INSTRUCTOR');
    assert.equal(developmentRegistration.body.data.user.status, 'PENDING');
    assert.equal(developmentRegistration.body.data.verificationRequired, true);
    const developmentDelivery = verificationDeliveries.find(item => item.email === developmentInstructorTestEmail);
    const developmentVerificationCode = developmentDelivery.verificationCode;

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
    assert.equal(pendingLogin.body.code, 'INSTRUCTOR_EMAIL_UNVERIFIED');
    assert.equal(pendingLogin.body.data?.token, undefined);
    const pendingCount = await pool.query('SELECT successful_login_count FROM users WHERE id=$1', [pendingId]);
    assert.equal(Number(pendingCount.rows[0].successful_login_count), 0);

    const legacyPendingToken = signToken({ id: pendingId, role: 'INSTRUCTOR', authVersion: 0 });
    const pendingMe = await request(base, 'GET', '/auth/me', { token: legacyPendingToken });
    assert.equal(pendingMe.status, 403);
    assert.equal(pendingMe.body.code, 'INSTRUCTOR_EMAIL_UNVERIFIED');
    const pendingApi = await request(base, 'GET', '/sections/instructor/sections', { token: legacyPendingToken });
    assert.equal(pendingApi.status, 403);
    assert.equal(pendingApi.body.code, 'INSTRUCTOR_EMAIL_UNVERIFIED');

    const queue = await request(base, 'GET', '/admin/instructors/pending', { token: adminToken });
    assert.equal(queue.status, 200);
    const queuedInstructor = queue.body.data.instructors.find(instructor => instructor.id === pendingId);
    assert.equal(queuedInstructor.emailVerifiedAt, null);
    const blockedApproval = await request(base, 'PATCH', `/admin/instructors/${pendingId}/approve`, { token: adminToken });
    assert.equal(blockedApproval.status, 409);
    assert.equal(blockedApproval.body.code, 'INSTRUCTOR_EMAIL_UNVERIFIED');
    const blockedDevelopmentApproval = await request(base, 'PATCH', `/admin/instructors/${developmentInstructorId}/approve`, { token: adminToken });
    assert.equal(blockedDevelopmentApproval.status, 409);
    assert.equal(blockedDevelopmentApproval.body.code, 'INSTRUCTOR_EMAIL_UNVERIFIED');

    const deliveriesBeforeResend = verificationDeliveries.length;
    const resend = await emailVerification.resendVerification({ email: pendingEmail });
    assert.equal(resend.message, emailVerification.PUBLIC_RESEND_MESSAGE);
    assert.equal(verificationDeliveries.length, deliveriesBeforeResend + 1);
    assert.equal(verificationDeliveries.at(-1).role, 'INSTRUCTOR');
    instructorVerificationCode = verificationDeliveries.at(-1).verificationCode;

    const instructorVerification = await request(base, 'POST', '/auth/verify-email', {
      body: { email: pendingEmail, code: instructorVerificationCode },
    });
    assert.equal(instructorVerification.status, 200);
    assert.equal(instructorVerification.body.data.role, 'INSTRUCTOR');
    const reusedInstructorToken = await request(base, 'POST', '/auth/verify-email', {
      body: { email: pendingEmail, code: instructorVerificationCode },
    });
    assert.equal(reusedInstructorToken.status, 400);
    const verifiedPendingRow = await pool.query('SELECT status,email_verified_at FROM users WHERE id=$1', [pendingId]);
    assert.equal(verifiedPendingRow.rows[0].status, 'PENDING');
    assert.ok(verifiedPendingRow.rows[0].email_verified_at);
    const verifiedQueue = await request(base, 'GET', '/admin/instructors/pending', { token: adminToken });
    const verifiedQueuedInstructor = verifiedQueue.body.data.instructors.find(instructor => instructor.id === pendingId);
    assert.ok(verifiedQueuedInstructor.emailVerifiedAt);
    const verifiedPendingLogin = await login(pendingEmail, password, 'INSTRUCTOR');
    assert.equal(verifiedPendingLogin.status, 403);
    assert.equal(verifiedPendingLogin.body.code, 'INSTRUCTOR_PENDING');

    const developmentVerification = await request(base, 'POST', '/auth/verify-email', {
      body: { email: developmentInstructorTestEmail, code: developmentVerificationCode },
    });
    assert.equal(developmentVerification.status, 200);
    const verifiedDevelopmentRow = await pool.query('SELECT status,email_verified_at FROM users WHERE id=$1', [developmentInstructorId]);
    assert.equal(verifiedDevelopmentRow.rows[0].status, 'PENDING');
    assert.ok(verifiedDevelopmentRow.rows[0].email_verified_at);
    const developmentPendingLogin = await login(developmentInstructorTestEmail, password, 'INSTRUCTOR');
    assert.equal(developmentPendingLogin.status, 403);
    assert.equal(developmentPendingLogin.body.code, 'INSTRUCTOR_PENDING');
    const developmentApproval = await request(base, 'PATCH', `/admin/instructors/${developmentInstructorId}/approve`, { token: adminToken });
    assert.equal(developmentApproval.status, 200);
    assert.equal(developmentApproval.body.data.user.status, 'ACTIVE');
    const developmentLogin = await login(developmentInstructorTestEmail, password, 'INSTRUCTOR');
    assert.equal(developmentLogin.status, 200);

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

    console.log('PASS registration creates pending, unverified instructors without accepting a public ADMIN role');
    console.log('PASS instructor verification sets email ownership without activating the account');
    console.log('PASS unverified instructors cannot be approved and verified instructors can be approved');
    console.log('PASS instructor resend uses the shared enumeration-safe verification service');
    console.log('PASS development test email still requires verification and administrator approval');
    console.log('PASS wrong credentials do not reveal approval status');
    console.log('PASS pending login, /auth/me, and instructor APIs are denied');
    console.log('PASS admin approval enables a fresh instructor login, not an old token');
    console.log('PASS suspension and reactivation revoke existing instructor sessions');
    console.log('PASS rejected instructors cannot sign in');
    console.log('PASS verified student registration/login and admin login remain available');
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
