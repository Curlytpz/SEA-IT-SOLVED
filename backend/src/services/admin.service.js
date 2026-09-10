const pool     = require('../db/pool');
const AppError = require('../utils/AppError');

function safeUser(row) {
  return {
    id:            row.id,
    firstName:     row.first_name,
    lastName:      row.last_name,
    email:         row.email,
    studentNumber: row.student_number || undefined,
    role:          row.role,
    status:        row.status,
    createdAt:     row.created_at,
  };
}

// ─── Pending instructors ──────────────────────────────────────────────────

async function getPendingInstructors() {
  const { rows } = await pool.query(
    `SELECT id, first_name, last_name, email, role, status, created_at
     FROM users WHERE role = 'INSTRUCTOR' AND status = 'PENDING'
     ORDER BY created_at ASC`
  );
  return rows.map(safeUser);
}

// ─── Approve / reject instructor ──────────────────────────────────────────

async function approveInstructor(instructorId) {
  const { rows } = await pool.query(
    `UPDATE users SET status = 'ACTIVE'
     WHERE id = $1 AND role = 'INSTRUCTOR' AND status = 'PENDING'
     RETURNING *`,
    [instructorId]
  );
  if (rows.length === 0) throw new AppError('Instructor not found or already processed.', 404);
  return safeUser(rows[0]);
}

async function rejectInstructor(instructorId) {
  const { rows } = await pool.query(
    `UPDATE users SET status = 'REJECTED'
     WHERE id = $1 AND role = 'INSTRUCTOR' AND status = 'PENDING'
     RETURNING *`,
    [instructorId]
  );
  if (rows.length === 0) throw new AppError('Instructor not found or already processed.', 404);
  return safeUser(rows[0]);
}

// ─── All users ────────────────────────────────────────────────────────────

async function getAllUsers({ role, status, page = 1, limit = 50 }) {
  const conditions = [];
  const params = [];

  if (role)   { params.push(role);   conditions.push(`role = $${params.length}`); }
  if (status) { params.push(status); conditions.push(`status = $${params.length}`); }

  const where  = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const offset = (Math.max(1, page) - 1) * limit;
  params.push(limit, offset);

  const { rows } = await pool.query(
    `SELECT id, first_name, last_name, email, student_number, role, status, created_at
     FROM users ${where}
     ORDER BY created_at DESC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );

  const countParams = params.slice(0, -2);
  const { rows: countRows } = await pool.query(
    `SELECT COUNT(*) FROM users ${where}`,
    countParams
  );

  return {
    users: rows.map(safeUser),
    total: parseInt(countRows[0].count, 10),
    page,
    limit,
  };
}

// ─── Update user status (suspend / reactivate) ────────────────────────────
// Unified endpoint. Only ACTIVE↔SUSPENDED transitions are permitted.
// Admins cannot change their own status.

async function setUserStatus(userId, newStatus, adminId) {
  const ALLOWED = ['ACTIVE', 'SUSPENDED'];
  if (!ALLOWED.includes(newStatus)) {
    throw new AppError(`Invalid status. Allowed values: ${ALLOWED.join(', ')}.`, 400);
  }

  if (userId === adminId) {
    throw new AppError('You cannot change the status of your own account.', 400);
  }

  // Fetch current user
  const { rows: found } = await pool.query(
    'SELECT id, role, status FROM users WHERE id = $1',
    [userId]
  );
  if (found.length === 0) throw new AppError('User not found.', 404);

  const target = found[0];
  if (target.role === 'ADMIN') {
    throw new AppError('Admin accounts cannot be suspended.', 400);
  }

  // Validate transition
  if (newStatus === 'SUSPENDED' && target.status !== 'ACTIVE') {
    throw new AppError('Only ACTIVE accounts can be suspended.', 400);
  }
  if (newStatus === 'ACTIVE' && target.status !== 'SUSPENDED') {
    throw new AppError('Only SUSPENDED accounts can be reactivated.', 400);
  }

  const { rows } = await pool.query(
    'UPDATE users SET status = $1 WHERE id = $2 RETURNING *',
    [newStatus, userId]
  );
  return safeUser(rows[0]);
}

// ─── Delete user ──────────────────────────────────────────────────────────
// Permanent destructive action. Admin cannot delete themselves.
// Does NOT cascade through instructor academic records — FK RESTRICT on
// sections and lesson_sessions protects data integrity.

async function deleteUser(userId, adminId) {
  if (userId === adminId) {
    throw new AppError('You cannot delete your own account.', 400);
  }

  const { rows: found } = await pool.query(
    'SELECT id, role FROM users WHERE id = $1',
    [userId]
  );
  if (found.length === 0) throw new AppError('User not found.', 404);
  if (found[0].role === 'ADMIN') {
    throw new AppError('Admin accounts cannot be deleted through this endpoint.', 400);
  }

 try {
  const result = await pool.query(
    `DELETE FROM users
     WHERE id = $1
     RETURNING id`,
    [userId]
  );

  if (result.rows.length === 0) {
    throw new AppError('User not found.', 404);
  }

  return {
    message: 'User deleted successfully.'
  };
} catch (err) {
  if (err.code === '23503') {
    throw new AppError(
      'This user cannot be deleted because they still own academic records. Suspend the account instead.',
      409
    );
  }

  throw err;
}
}
async function forceDeleteInstructor(userId, adminId) {
  if (userId === adminId) {
    throw new AppError('You cannot delete your own account.', 400);
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const { rows: found } = await client.query(
      `SELECT id, role
       FROM users
       WHERE id = $1
       FOR UPDATE`,
      [userId]
    );

    if (found.length === 0) {
      throw new AppError('User not found.', 404);
    }

    if (found[0].role !== 'INSTRUCTOR') {
      throw new AppError(
        'Force delete is only available for instructor accounts.',
        400
      );
    }

    // Find all sections owned by this instructor
    const { rows: sections } = await client.query(
      `SELECT id
       FROM sections
       WHERE instructor_id = $1`,
      [userId]
    );

    const sectionIds = sections.map(section => section.id);

    let deletedPauseEvents = 0;
    let deletedLessons = 0;
    let deletedEnrollments = 0;
    let deletedSections = 0;

    if (sectionIds.length > 0) {
      // Delete pause events belonging to lessons in instructor sections
      const pauseResult = await client.query(
        `DELETE FROM lesson_pause_events
         WHERE lesson_id IN (
           SELECT ls.id
           FROM lesson_sessions ls
           WHERE ls.section_id = ANY($1::uuid[])
         )`,
        [sectionIds]
      );

      deletedPauseEvents = pauseResult.rowCount;

      // Delete lessons
      const lessonResult = await client.query(
        `DELETE FROM lesson_sessions
         WHERE section_id = ANY($1::uuid[])`,
        [sectionIds]
      );

      deletedLessons = lessonResult.rowCount;

      // Delete enrollments tied to those sections
      const enrollmentResult = await client.query(
        `DELETE FROM enrollments
         WHERE section_id = ANY($1::uuid[])`,
        [sectionIds]
      );

      deletedEnrollments = enrollmentResult.rowCount;

      // Delete sections
      const sectionResult = await client.query(
        `DELETE FROM sections
         WHERE instructor_id = $1`,
        [userId]
      );

      deletedSections = sectionResult.rowCount;
    }

    // Finally delete the instructor account
    await client.query(
      `DELETE FROM users
       WHERE id = $1`,
      [userId]
    );

    await client.query('COMMIT');

    return {
      message: 'Instructor and all owned academic records permanently deleted.',
      deleted: {
        sections: deletedSections,
        lessons: deletedLessons,
        pauseEvents: deletedPauseEvents,
        enrollments: deletedEnrollments,
      },
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
module.exports = {
  getPendingInstructors,
  approveInstructor,
  rejectInstructor,
  getAllUsers,
  setUserStatus,
  deleteUser,
  forceDeleteInstructor,
};
