const assert = require('assert/strict');
const crypto = require('crypto');
require('../src/config/env');
const pool = require('../src/db/pool');
const { signToken } = require('../src/utils/jwt');

async function main() {
  const { rows: sections } = await pool.query(
    `SELECT s.id, s.join_code
     FROM sections s JOIN users instructor ON instructor.id = s.instructor_id
     WHERE instructor.role = 'INSTRUCTOR' AND instructor.status = 'ACTIVE'
     ORDER BY s.created_at DESC LIMIT 1`
  );
  assert(sections.length, 'An active instructor section is required for this verification.');

  const suffix = crypto.randomBytes(6).toString('hex');
  const students = [];
  let server;
  try {
    for (const label of ['confirm', 'cancel', 'approved', 'pending']) {
      const { rows } = await pool.query(
        `INSERT INTO users(first_name,last_name,email,student_number,password_hash,role,status)
         VALUES('Join Flow',$1,$2,$3,'verification-only','STUDENT','ACTIVE')
         RETURNING id`,
        [label, `join-${label}-${suffix}@student.hau.edu.ph`, `JF-${label}-${suffix}`]
      );
      students.push(rows[0].id);
    }

    await pool.query(
      `INSERT INTO enrollments(section_id,student_id,status,approved_at)
       VALUES($1,$2,'APPROVED',NOW()),($1,$3,'PENDING',NULL)`,
      [sections[0].id, students[2], students[3]]
    );

    const app = require('../src/app');
    server = app.listen(0);
    await new Promise(resolve => server.once('listening', resolve));
    const base = `http://127.0.0.1:${server.address().port}/api/sections`;
    const headersFor = studentId => ({
      'Content-Type': 'application/json',
      Authorization: `Bearer ${signToken({ id: studentId, role: 'STUDENT', authVersion: 0 })}`,
    });
    const post = (path, studentId, body) => fetch(`${base}${path}`, {
      method: 'POST', headers: headersFor(studentId), body: JSON.stringify(body),
    });

    const preview = await post('/join-code/preview', students[0], { joinCode: sections[0].join_code.toLowerCase() });
    const previewBody = await preview.json();
    assert.equal(preview.status, 200);
    assert.deepEqual(Object.keys(previewBody.data.section).sort(), ['instructorName', 'sectionName', 'subjectCode']);
    const beforeConfirm = await pool.query(
      'SELECT COUNT(*)::int AS count FROM enrollments WHERE section_id=$1 AND student_id=$2',
      [sections[0].id, students[0]]
    );
    assert.equal(beforeConfirm.rows[0].count, 0, 'Preview must not create an enrollment.');

    const requested = await post('/join-code', students[0], { joinCode: sections[0].join_code });
    const requestedBody = await requested.json();
    assert.equal(requested.status, 201);
    assert.equal(requestedBody.data.enrollment.status, 'PENDING');

    const duplicate = await post('/join-code', students[0], { joinCode: sections[0].join_code });
    const duplicateBody = await duplicate.json();
    assert.equal(duplicate.status, 409);
    assert.equal(duplicateBody.error, 'Your request is already waiting for instructor approval.');
    const afterDuplicate = await pool.query(
      'SELECT COUNT(*)::int AS count FROM enrollments WHERE section_id=$1 AND student_id=$2',
      [sections[0].id, students[0]]
    );
    assert.equal(afterDuplicate.rows[0].count, 1);

    const cancelPreview = await post('/join-code/preview', students[1], { joinCode: sections[0].join_code });
    assert.equal(cancelPreview.status, 200);
    const afterCancel = await pool.query(
      'SELECT COUNT(*)::int AS count FROM enrollments WHERE section_id=$1 AND student_id=$2',
      [sections[0].id, students[1]]
    );
    assert.equal(afterCancel.rows[0].count, 0, 'Preview followed by no confirmation must not create a request.');

    const invalid = await post('/join-code/preview', students[1], { joinCode: `NO${suffix}` });
    const invalidBody = await invalid.json();
    assert.equal(invalid.status, 404);
    assert.equal(invalidBody.error, 'Class code not found. Check the code and try again.');
    assert.equal(invalidBody.data, undefined);

    const approved = await post('/join-code/preview', students[2], { joinCode: sections[0].join_code });
    const approvedBody = await approved.json();
    assert.equal(approved.status, 409);
    assert.equal(approvedBody.error, 'You are already enrolled in this section.');

    const pending = await post('/join-code/preview', students[3], { joinCode: sections[0].join_code });
    const pendingBody = await pending.json();
    assert.equal(pending.status, 409);
    assert.equal(pendingBody.error, 'Your request is already waiting for instructor approval.');

    console.log('PASS exact-code preview returns only confirmation fields');
    console.log('PASS preview and cancel create no enrollment request');
    console.log('PASS explicit confirmation creates one pending request');
    console.log('PASS invalid code does not enumerate sections');
    console.log('PASS approved and pending duplicate protection');
  } finally {
    if (server) await new Promise(resolve => server.close(resolve));
    if (students.length) await pool.query('DELETE FROM users WHERE id=ANY($1::uuid[])', [students]);
    await pool.end();
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
