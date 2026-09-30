const pool = require('../db/pool');
const AppError = require('../utils/AppError');
const { signToken, signVerificationSession } = require('../utils/jwt');

function buildSafeUser(row) {
  return {
    id: row.id,
    firstName: row.first_name,
    lastName: row.last_name,
    email: row.email,
    studentNumber: row.student_number || undefined,
    role: row.role,
    status: row.status,
    successfulLoginCount: Number(row.successful_login_count) || 0,
    createdAt: row.created_at,
  };
}

function createVerificationSession(user) {
  return signVerificationSession({
    userId: user.id,
    role: user.role,
    authVersion: user.auth_version,
  });
}

async function completeActiveLogin({ userId, role }) {
  const successfulLogin = await pool.query(
    `UPDATE users
     SET successful_login_count = successful_login_count + 1
     WHERE id = $1
       AND role = $2
       AND status = 'ACTIVE'
       AND (role = 'ADMIN' OR email_verified_at IS NOT NULL)
     RETURNING *`,
    [userId, role]
  );
  const user = successfulLogin.rows[0];
  if (!user) {
    throw new AppError('Your account access changed. Please sign in again.', 403);
  }
  const token = signToken({
    id: user.id,
    role: user.role,
    authVersion: Number(user.auth_version) || 0,
  });
  return { user: buildSafeUser(user), token };
}

module.exports = { buildSafeUser, createVerificationSession, completeActiveLogin };
