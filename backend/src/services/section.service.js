const pool     = require('../db/pool');
const AppError = require('../utils/AppError');
const { uniqueJoinCode } = require('../utils/joinCode');

function safeEnrollment(row) {
  return { id: row.id, sectionId: row.section_id, studentId: row.student_id,
           status: row.status, requestedAt: row.requested_at, approvedAt: row.approved_at };
}

function safeSection(row) {
  return {
    id: row.id, subjectId: row.subject_id, subjectCode: row.subject_code,
    subjectName: row.subject_name, instructorId: row.instructor_id,
    instructorName: row.instructor_name, sectionName: row.section_name,
    joinCode: row.join_code, teachingFolderId: row.teaching_folder_id || null, createdAt: row.created_at,
    enrolledCount: row.enrolled_count !== undefined ? parseInt(row.enrolled_count, 10) : undefined,
    pendingCount:  row.pending_count  !== undefined ? parseInt(row.pending_count,  10) : undefined,
  };
}

async function createSection({ subjectId, sectionName, instructorId, folderId = null }) {
  const cleanName = typeof sectionName === 'string' ? sectionName.trim() : '';
  if (!subjectId || !cleanName) throw new AppError('subjectId and sectionName are required.', 400);
  if (cleanName.length > 120) throw new AppError('Section name must be 120 characters or fewer.', 400);
  const { rows: subj } = await pool.query('SELECT id FROM subjects WHERE id = $1', [subjectId]);
  if (subj.length === 0) throw new AppError('Subject not found.', 404);
  const { rows: duplicate } = await pool.query(
    `SELECT id FROM sections
     WHERE instructor_id = $1 AND subject_id = $2 AND LOWER(section_name) = LOWER($3)
     LIMIT 1`,
    [instructorId, subjectId, cleanName]
  );
  if (duplicate.length) {
    throw new AppError('A section with this name already exists for this subject.', 409);
  }
  if (folderId) {
    const { rows: folders } = await pool.query(
      `SELECT id FROM teaching_folders
       WHERE id = $1 AND instructor_id = $2 AND archived_at IS NULL`,
      [folderId, instructorId]
    );
    if (!folders.length) throw new AppError('Folder not found, archived, or access denied.', 404);
  }
  const joinCode = await uniqueJoinCode();
  const { rows } = await pool.query(
    `INSERT INTO sections (subject_id, instructor_id, teaching_folder_id, section_name, join_code)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [subjectId, instructorId, folderId || null, cleanName, joinCode]
  );
  const { rows: full } = await pool.query(
    `SELECT s.*, sub.code AS subject_code, sub.name AS subject_name,
            (u.first_name || ' ' || u.last_name) AS instructor_name,
            0 AS enrolled_count, 0 AS pending_count
     FROM sections s JOIN subjects sub ON sub.id = s.subject_id
     JOIN users u ON u.id = s.instructor_id WHERE s.id = $1`,
    [rows[0].id]
  );
  return safeSection(full[0]);
}

async function deleteSection(sectionId, instructorId) {
  const { rows: own } = await pool.query(
    'SELECT id FROM sections WHERE id = $1 AND instructor_id = $2',
    [sectionId, instructorId]
  );
  if (own.length === 0) throw new AppError('Section not found or access denied.', 404);
  const { rows: lessons } = await pool.query(
    'SELECT id FROM lesson_sessions WHERE section_id = $1 LIMIT 1',
    [sectionId]
  );
  if (lessons.length > 0) {
    throw new AppError(
      'This section cannot be deleted because it already contains lesson records.',
      409
    );
  }
  await pool.query('DELETE FROM sections WHERE id = $1', [sectionId]);
}

async function getInstructorSections(instructorId) {
  const { rows } = await pool.query(
    `SELECT s.*, sub.code AS subject_code, sub.name AS subject_name,
            (u.first_name || ' ' || u.last_name) AS instructor_name,
            COUNT(CASE WHEN e.status = 'APPROVED' THEN 1 END) AS enrolled_count,
            COUNT(CASE WHEN e.status = 'PENDING'  THEN 1 END) AS pending_count
     FROM sections s JOIN subjects sub ON sub.id = s.subject_id
     JOIN users u ON u.id = s.instructor_id
     LEFT JOIN enrollments e ON e.section_id = s.id
     WHERE s.instructor_id = $1
     GROUP BY s.id, sub.code, sub.name, u.first_name, u.last_name
     ORDER BY s.created_at DESC`,
    [instructorId]
  );
  return rows.map(safeSection);
}

function validateFolderName(name) {
  const value = typeof name === 'string' ? name.trim() : '';
  if (!value) throw new AppError('Folder name is required.', 400);
  if (value.length > 120) throw new AppError('Folder name must be 120 characters or fewer.', 400);
  return value;
}

function groupSectionsBySubject(sections) {
  const groups = new Map();
  sections.forEach(section => {
    const key = section.subjectId;
    if (!groups.has(key)) groups.set(key, {
      subjectId: key, subjectCode: section.subjectCode,
      subjectName: section.subjectName, sections: [],
    });
    groups.get(key).sections.push(section);
  });
  return Array.from(groups.values()).sort((a, b) =>
    String(a.subjectCode).localeCompare(String(b.subjectCode))
  );
}

async function getTeachingWorkspace(instructorId) {
  const [{ rows: folderRows }, sections] = await Promise.all([
    pool.query(
      `SELECT id, name, display_order, archived_at, created_at, updated_at
       FROM teaching_folders WHERE instructor_id = $1
       ORDER BY (archived_at IS NOT NULL), display_order, created_at`,
      [instructorId]
    ),
    getInstructorSections(instructorId),
  ]);
  const byFolder = new Map(folderRows.map(folder => [folder.id, []]));
  const unorganized = [];
  sections.forEach(section => {
    const target = section.teachingFolderId && byFolder.get(section.teachingFolderId);
    if (target) target.push(section); else unorganized.push(section);
  });
  const folders = folderRows.map(folder => ({
    id: folder.id,
    name: folder.name,
    displayOrder: folder.display_order,
    archivedAt: folder.archived_at,
    createdAt: folder.created_at,
    updatedAt: folder.updated_at,
    sectionCount: byFolder.get(folder.id).length,
    subjectGroups: groupSectionsBySubject(byFolder.get(folder.id)),
  }));
  return {
    folders,
    unorganized: {
      id: null, name: 'Unorganized', sectionCount: unorganized.length,
      subjectGroups: groupSectionsBySubject(unorganized),
    },
  };
}

async function createTeachingFolder(instructorId, name) {
  const cleanName = validateFolderName(name);
  try {
    const { rows } = await pool.query(
      `INSERT INTO teaching_folders (instructor_id, name, display_order)
       VALUES ($1, $2, COALESCE((SELECT MAX(display_order) + 1 FROM teaching_folders WHERE instructor_id = $1 AND archived_at IS NULL), 0))
       RETURNING id, name, display_order, archived_at, created_at, updated_at`,
      [instructorId, cleanName]
    );
    return rows[0];
  } catch (error) {
    if (error.code === '23505') throw new AppError('A folder with this name already exists.', 409);
    throw error;
  }
}

async function renameTeachingFolder(folderId, instructorId, name) {
  const cleanName = validateFolderName(name);
  try {
    const { rows } = await pool.query(
      `UPDATE teaching_folders SET name = $1, updated_at = NOW()
       WHERE id = $2 AND instructor_id = $3 RETURNING id, name, display_order, archived_at`,
      [cleanName, folderId, instructorId]
    );
    if (!rows.length) throw new AppError('Folder not found or access denied.', 404);
    return rows[0];
  } catch (error) {
    if (error.code === '23505') throw new AppError('A folder with this name already exists.', 409);
    throw error;
  }
}

async function reorderTeachingFolders(instructorId, folderIds) {
  if (!Array.isArray(folderIds) || !folderIds.length || new Set(folderIds).size !== folderIds.length) {
    throw new AppError('Provide a valid ordered folder list.', 400);
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `SELECT id FROM teaching_folders
       WHERE instructor_id = $1 AND archived_at IS NULL ORDER BY display_order, created_at FOR UPDATE`,
      [instructorId]
    );
    const ownedIds = rows.map(row => row.id);
    if (ownedIds.length !== folderIds.length || folderIds.some(id => !ownedIds.includes(id))) {
      throw new AppError('Folder order contains unavailable folders.', 400);
    }
    for (let index = 0; index < folderIds.length; index += 1) {
      await client.query(
        'UPDATE teaching_folders SET display_order = $1, updated_at = NOW() WHERE id = $2 AND instructor_id = $3',
        [index, folderIds[index], instructorId]
      );
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function setTeachingFolderArchived(folderId, instructorId, archived) {
  if (typeof archived !== 'boolean') throw new AppError('archived must be true or false.', 400);
  const { rows } = await pool.query(
    `UPDATE teaching_folders
     SET archived_at = CASE WHEN $1 THEN COALESCE(archived_at, NOW()) ELSE NULL END,
         updated_at = NOW()
     WHERE id = $2 AND instructor_id = $3
     RETURNING id, name, display_order, archived_at`,
    [archived, folderId, instructorId]
  );
  if (!rows.length) throw new AppError('Folder not found or access denied.', 404);
  return rows[0];
}

async function deleteTeachingFolder(folderId, instructorId) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      'SELECT id FROM teaching_folders WHERE id = $1 AND instructor_id = $2 FOR UPDATE',
      [folderId, instructorId]
    );
    if (!rows.length) throw new AppError('Folder not found or access denied.', 404);
    await client.query(
      'UPDATE sections SET teaching_folder_id = NULL WHERE teaching_folder_id = $1 AND instructor_id = $2',
      [folderId, instructorId]
    );
    await client.query('DELETE FROM teaching_folders WHERE id = $1 AND instructor_id = $2', [folderId, instructorId]);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function moveSectionToFolder(sectionId, instructorId, folderId) {
  if (folderId) {
    const { rows: folders } = await pool.query(
      `SELECT id FROM teaching_folders
       WHERE id = $1 AND instructor_id = $2 AND archived_at IS NULL`,
      [folderId, instructorId]
    );
    if (!folders.length) throw new AppError('Folder not found, archived, or access denied.', 404);
  }
  const { rows } = await pool.query(
    `UPDATE sections SET teaching_folder_id = $1
     WHERE id = $2 AND instructor_id = $3 RETURNING id, teaching_folder_id`,
    [folderId || null, sectionId, instructorId]
  );
  if (!rows.length) throw new AppError('Section not found or access denied.', 404);
  return { sectionId: rows[0].id, folderId: rows[0].teaching_folder_id };
}

async function getSectionById(sectionId) {
  const { rows } = await pool.query(
    `SELECT s.*, sub.code AS subject_code, sub.name AS subject_name,
            (u.first_name || ' ' || u.last_name) AS instructor_name,
            COUNT(CASE WHEN e.status = 'APPROVED' THEN 1 END) AS enrolled_count,
            COUNT(CASE WHEN e.status = 'PENDING'  THEN 1 END) AS pending_count
     FROM sections s JOIN subjects sub ON sub.id = s.subject_id
     JOIN users u ON u.id = s.instructor_id
     LEFT JOIN enrollments e ON e.section_id = s.id
     WHERE s.id = $1
     GROUP BY s.id, sub.code, sub.name, u.first_name, u.last_name`,
    [sectionId]
  );
  if (rows.length === 0) throw new AppError('Section not found.', 404);
  return safeSection(rows[0]);
}

async function getJoinRequests(sectionId, instructorId) {
  const { rows: own } = await pool.query(
    'SELECT id FROM sections WHERE id = $1 AND instructor_id = $2', [sectionId, instructorId]
  );
  if (own.length === 0) throw new AppError('Section not found or access denied.', 404);
  const { rows } = await pool.query(
    `SELECT e.id, e.status, e.requested_at, e.approved_at,
            u.id AS student_id, u.first_name, u.last_name, u.email, u.student_number
     FROM enrollments e JOIN users u ON u.id = e.student_id
     WHERE e.section_id = $1 AND e.status = 'PENDING' ORDER BY e.requested_at ASC`,
    [sectionId]
  );
  return rows.map(r => ({
    enrollmentId: r.id, status: r.status, requestedAt: r.requested_at,
    student: { id: r.student_id, firstName: r.first_name, lastName: r.last_name,
               email: r.email, studentNumber: r.student_number },
  }));
}

async function approveEnrollment(enrollmentId, instructorId) {
  const { rows } = await pool.query(
    `UPDATE enrollments e SET status = 'APPROVED', approved_at = NOW()
     FROM sections s WHERE e.id = $1 AND e.section_id = s.id
       AND s.instructor_id = $2 AND e.status = 'PENDING' RETURNING e.*`,
    [enrollmentId, instructorId]
  );
  if (rows.length === 0) throw new AppError('Enrollment not found, not pending, or access denied.', 404);
  return safeEnrollment(rows[0]);
}

async function rejectEnrollment(enrollmentId, instructorId) {
  const { rows } = await pool.query(
    `UPDATE enrollments e SET status = 'REJECTED'
     FROM sections s WHERE e.id = $1 AND e.section_id = s.id
       AND s.instructor_id = $2 AND e.status = 'PENDING' RETURNING e.*`,
    [enrollmentId, instructorId]
  );
  if (rows.length === 0) throw new AppError('Enrollment not found, not pending, or access denied.', 404);
  return safeEnrollment(rows[0]);
}

async function getEnrolledStudents(sectionId, instructorId) {
  const { rows: own } = await pool.query(
    'SELECT id FROM sections WHERE id = $1 AND instructor_id = $2', [sectionId, instructorId]
  );
  if (own.length === 0) throw new AppError('Section not found or access denied.', 404);
  const { rows } = await pool.query(
    `SELECT u.id, u.first_name, u.last_name, u.email, u.student_number,
            e.id AS enrollment_id, e.approved_at
     FROM enrollments e JOIN users u ON u.id = e.student_id
     WHERE e.section_id = $1 AND e.status = 'APPROVED' ORDER BY u.last_name, u.first_name`,
    [sectionId]
  );
  return rows.map(r => ({
    enrollmentId: r.enrollment_id, approvedAt: r.approved_at, id: r.id,
    firstName: r.first_name, lastName: r.last_name, email: r.email, studentNumber: r.student_number,
  }));
}

async function removeStudent(sectionId, studentId, instructorId) {
  const { rows: own } = await pool.query(
    'SELECT id FROM sections WHERE id = $1 AND instructor_id = $2', [sectionId, instructorId]
  );
  if (own.length === 0) throw new AppError('Section not found or access denied.', 404);
  const { rows } = await pool.query(
    `DELETE FROM enrollments WHERE section_id = $1 AND student_id = $2 AND status = 'APPROVED' RETURNING id`,
    [sectionId, studentId]
  );
  if (rows.length === 0) throw new AppError('Student is not enrolled in this section.', 404);
}

async function manuallyAddStudent(sectionId, studentNumber, instructorId) {
  if (!studentNumber) throw new AppError('studentNumber is required.', 400);
  const { rows: own } = await pool.query(
    'SELECT id FROM sections WHERE id = $1 AND instructor_id = $2', [sectionId, instructorId]
  );
  if (own.length === 0) throw new AppError('Section not found or access denied.', 404);
  const { rows: students } = await pool.query(
    `SELECT id, status FROM users WHERE student_number = $1 AND role = 'STUDENT'`,
    [studentNumber.trim()]
  );
  if (students.length === 0) {
    throw new AppError(
      'No student account found with student number "' + studentNumber + '". The student must register first.', 404
    );
  }
  if (students[0].status !== 'ACTIVE') {
    throw new AppError('Only active student accounts can be added to a section.', 400);
  }
  const studentId = students[0].id;
  const { rows: existing } = await pool.query(
    'SELECT id, status FROM enrollments WHERE section_id = $1 AND student_id = $2', [sectionId, studentId]
  );
  if (existing.length > 0) {
    if (existing[0].status === 'APPROVED') throw new AppError('This student is already enrolled in the section.', 409);
    const { rows: updated } = await pool.query(
      `UPDATE enrollments SET status = 'APPROVED', approved_at = NOW() WHERE id = $1 RETURNING *`,
      [existing[0].id]
    );
    return safeEnrollment(updated[0]);
  }
  const { rows } = await pool.query(
    `INSERT INTO enrollments (section_id, student_id, status, approved_at) VALUES ($1, $2, 'APPROVED', NOW()) RETURNING *`,
    [sectionId, studentId]
  );
  return safeEnrollment(rows[0]);
}

async function searchSections(query) {
  if (!query || query.trim().length < 2) throw new AppError('Search query must be at least 2 characters.', 400);
  const q = '%' + query.trim().toLowerCase() + '%';
  const { rows } = await pool.query(
    `SELECT s.id, s.section_name, sub.code AS subject_code, sub.name AS subject_name,
            (u.first_name || ' ' || u.last_name) AS instructor_name,
            COUNT(CASE WHEN e.status = 'APPROVED' THEN 1 END) AS enrolled_count
     FROM sections s JOIN subjects sub ON sub.id = s.subject_id
     JOIN users u ON u.id = s.instructor_id
     LEFT JOIN enrollments e ON e.section_id = s.id
     WHERE u.role = 'INSTRUCTOR' AND u.status = 'ACTIVE'
       AND (LOWER(sub.name) LIKE $1 OR LOWER(sub.code) LIKE $1 OR LOWER(s.section_name) LIKE $1)
     GROUP BY s.id, sub.code, sub.name, u.first_name, u.last_name
     ORDER BY sub.code, s.section_name LIMIT 30`,
    [q]
  );
  return rows.map(r => ({
    id: r.id, sectionName: r.section_name, subjectCode: r.subject_code,
    subjectName: r.subject_name, instructorName: r.instructor_name,
    enrolledCount: parseInt(r.enrolled_count, 10),
  }));
}

async function requestJoin(sectionId, studentId) {
  const { rows: sections } = await pool.query(
    `SELECT s.id, u.status AS instructor_status
     FROM sections s JOIN users u ON u.id = s.instructor_id
     WHERE s.id = $1`,
    [sectionId]
  );
  if (sections.length === 0) throw new AppError('Section not found.', 404);
  if (sections[0].instructor_status !== 'ACTIVE') {
    throw new AppError('This section is currently unavailable for enrollment.', 403);
  }
  const { rows: existing } = await pool.query(
    'SELECT id, status FROM enrollments WHERE section_id = $1 AND student_id = $2',
    [sectionId, studentId]
  );
  if (existing.length > 0) {
    const { id: enrollmentId, status } = existing[0];
    if (status === 'PENDING') throw new AppError('Your request is already waiting for instructor approval.', 409);
    if (status === 'APPROVED') throw new AppError('You are already enrolled in this section.', 409);
    const { rows: updated } = await pool.query(
      `UPDATE enrollments SET status = 'PENDING', requested_at = NOW(), approved_at = NULL
       WHERE id = $1 RETURNING *`,
      [enrollmentId]
    );
    return safeEnrollment(updated[0]);
  }
  const { rows } = await pool.query(
    `INSERT INTO enrollments (section_id, student_id, status)
     VALUES ($1, $2, 'PENDING')
     ON CONFLICT (section_id, student_id) DO NOTHING
     RETURNING *`,
    [sectionId, studentId]
  );
  if (!rows.length) {
    const { rows: duplicate } = await pool.query(
      'SELECT status FROM enrollments WHERE section_id = $1 AND student_id = $2',
      [sectionId, studentId]
    );
    if (duplicate[0]?.status === 'APPROVED') throw new AppError('You are already enrolled in this section.', 409);
    throw new AppError('Your request is already waiting for instructor approval.', 409);
  }
  return safeEnrollment(rows[0]);
}

function normalizeJoinCode(joinCode) {
  if (!joinCode) throw new AppError('Join code is required.', 400);
  return String(joinCode).trim().toUpperCase();
}

async function findExactJoinSection(joinCode) {
  const normalizedCode = normalizeJoinCode(joinCode);
  const { rows } = await pool.query(
    `SELECT s.id, s.section_name, sub.code AS subject_code,
            (u.first_name || ' ' || u.last_name) AS instructor_name,
            u.status AS instructor_status
     FROM sections s
     JOIN subjects sub ON sub.id = s.subject_id
     JOIN users u ON u.id = s.instructor_id
     WHERE s.join_code = $1`,
    [normalizedCode]
  );
  if (!rows.length) throw new AppError('Class code not found. Check the code and try again.', 404);
  if (rows[0].instructor_status !== 'ACTIVE') {
    throw new AppError('This section is currently unavailable for enrollment.', 403);
  }
  return rows[0];
}

async function assertStudentCanRequest(sectionId, studentId) {
  const { rows } = await pool.query(
    'SELECT status FROM enrollments WHERE section_id = $1 AND student_id = $2',
    [sectionId, studentId]
  );
  if (rows[0]?.status === 'APPROVED') throw new AppError('You are already enrolled in this section.', 409);
  if (rows[0]?.status === 'PENDING') {
    throw new AppError('Your request is already waiting for instructor approval.', 409);
  }
}

async function previewJoinByCode(joinCode, studentId) {
  const section = await findExactJoinSection(joinCode);
  await assertStudentCanRequest(section.id, studentId);
  return {
    subjectCode: section.subject_code,
    sectionName: section.section_name,
    instructorName: section.instructor_name,
  };
}

async function joinByCode(joinCode, studentId) {
  const section = await findExactJoinSection(joinCode);
  return requestJoin(section.id, studentId);
}

async function getStudentSections(studentId) {
  const { rows } = await pool.query(
    `SELECT s.id, s.section_name, sub.code AS subject_code, sub.name AS subject_name,
            (u.first_name || ' ' || u.last_name) AS instructor_name,
            u.status AS instructor_status,
            e.id AS enrollment_id, e.status AS enrollment_status,
            e.requested_at, e.approved_at
     FROM enrollments e JOIN sections s ON s.id = e.section_id
     JOIN subjects sub ON sub.id = s.subject_id
     JOIN users u ON u.id = s.instructor_id
     WHERE e.student_id = $1 ORDER BY e.requested_at DESC`,
    [studentId]
  );
  return rows.map(r => ({
    enrollmentId: r.enrollment_id, enrollmentStatus: r.enrollment_status,
    requestedAt: r.requested_at, approvedAt: r.approved_at,
    section: {
      id: r.id, sectionName: r.section_name, subjectCode: r.subject_code,
      subjectName: r.subject_name, instructorName: r.instructor_name,
      instructorStatus: r.instructor_status,
    },
  }));
}

async function getSubjects() {
  const { rows } = await pool.query('SELECT id, code, name FROM subjects ORDER BY code');
  return rows;
}

module.exports = {
  createSection, deleteSection, getInstructorSections, getTeachingWorkspace, getSectionById,
  createTeachingFolder, renameTeachingFolder, reorderTeachingFolders,
  setTeachingFolderArchived, deleteTeachingFolder, moveSectionToFolder,
  getJoinRequests, approveEnrollment, rejectEnrollment, getEnrolledStudents,
  removeStudent, manuallyAddStudent, searchSections, requestJoin, previewJoinByCode, joinByCode,
  getStudentSections, getSubjects,
};
