const assert = require('assert/strict');
const crypto = require('crypto');
require('../src/config/env');
const pool = require('../src/db/pool');
const { signToken } = require('../src/utils/jwt');

function comparableChunk(row) {
  return {
    lessonId: row.lesson_id,
    chunkType: row.chunk_type,
    chunkOrder: row.chunk_order,
    lessonOffsetMs: row.lesson_offset_ms === null ? null : Number(row.lesson_offset_ms),
    source: row.source,
    rawText: row.raw_text,
    rawMath: row.raw_math,
    reviewedText: row.reviewed_text,
    reviewedMath: row.reviewed_math,
    uncertain: row.uncertain,
    removed: row.removed,
    edited: row.edited,
    contentType: row.content_type,
  };
}

async function main() {
  const suffix = crypto.randomBytes(6).toString('hex');
  let instructorId;
  let subjectId;
  let sectionId;
  let lessonId;
  let server;

  try {
    ({ rows: [{ id: instructorId }] } = await pool.query(
      `INSERT INTO users(first_name,last_name,email,password_hash,role,status)
       VALUES('Context','Reopen Verification',$1,'verification-only','INSTRUCTOR','ACTIVE') RETURNING id`,
      [`context-reopen-${suffix}@hau.edu.ph`]
    ));
    ({ rows: [{ id: subjectId }] } = await pool.query(
      `INSERT INTO subjects(code,name) VALUES($1,$2) RETURNING id`,
      [`CR${suffix.slice(0, 8).toUpperCase()}`, `Context Reopen ${suffix}`]
    ));
    ({ rows: [{ id: sectionId }] } = await pool.query(
      `INSERT INTO sections(subject_id,instructor_id,section_name,join_code)
       VALUES($1,$2,$3,$4) RETURNING id`,
      [subjectId, instructorId, `Context Reopen ${suffix}`, `CR${suffix.slice(0, 8).toUpperCase()}`]
    ));
    ({ rows: [{ id: lessonId }] } = await pool.query(
      `INSERT INTO lesson_sessions(section_id,instructor_id,title,topic,status,started_at,ended_at)
       VALUES($1,$2,'Context reopen verification','Limits','COMPLETED',NOW()-INTERVAL '1 hour',NOW()) RETURNING id`,
      [sectionId, instructorId]
    ));

    const { rows: [approvedV1] } = await pool.query(
      `INSERT INTO lesson_context_versions(
         lesson_id,section_id,instructor_id,version_number,status,approved_at,approved_by
       ) VALUES($1,$2,$3,1,'APPROVED',NOW(),$3) RETURNING *`,
      [lessonId, sectionId, instructorId]
    );
    await pool.query(
      `INSERT INTO lesson_context_chunks(
         context_version_id,lesson_id,chunk_type,chunk_order,lesson_offset_ms,source,
         raw_text,raw_math,reviewed_text,reviewed_math,uncertain,removed,edited,content_type
       ) VALUES
         ($1,$2,'WHITEBOARD',0,1250,$3,$4,$5,$6,$7,FALSE,FALSE,TRUE,'EXPLANATION'),
         ($1,$2,'SPEECH',1,3100,$8,'',$9,'',$9,TRUE,TRUE,FALSE,'FORMULA')`,
      [
        approvedV1.id,
        lessonId,
        JSON.stringify({ captureId: `verification-${suffix}`, pageNumber: 1 }),
        'Because both one-sided limits agree.',
        JSON.stringify(['\\lim_{x\\to 0} f(x)']),
        'Because the left and right limits agree, the limit exists.',
        JSON.stringify(['\\lim_{x\\to 0} f(x)=1']),
        JSON.stringify({ transcriptionSegmentIndex: 0 }),
        JSON.stringify(['x^2']),
      ]
    );

    const sourceV1 = (await pool.query(
      'SELECT * FROM lesson_context_chunks WHERE context_version_id=$1 ORDER BY chunk_order',
      [approvedV1.id]
    )).rows.map(comparableChunk);

    const app = require('../src/app');
    server = app.listen(0);
    await new Promise(resolve => server.once('listening', resolve));
    const baseUrl = `http://127.0.0.1:${server.address().port}/api/lessons/${lessonId}/context`;
    const headers = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${signToken({ id: instructorId, role: 'INSTRUCTOR', authVersion: 0 })}`,
    };
    const post = path => fetch(`${baseUrl}${path}`, { method: 'POST', headers });

    const firstReopen = await post('/reopen');
    const firstBody = await firstReopen.json();
    assert.equal(firstReopen.status, 201, JSON.stringify(firstBody));
    assert.equal(firstBody.success, true);
    assert.equal(firstBody.data.context.status, 'DRAFT');
    assert.equal(firstBody.data.context.versionNumber, 2);
    assert.equal(firstBody.data.context.chunks.length, sourceV1.length);

    const afterFirst = await pool.query(
      'SELECT * FROM lesson_context_versions WHERE lesson_id=$1 ORDER BY version_number',
      [lessonId]
    );
    assert.deepEqual(afterFirst.rows.map(row => row.status), ['APPROVED', 'DRAFT']);
    const draftV2 = afterFirst.rows[1];
    const copiedV2 = (await pool.query(
      'SELECT * FROM lesson_context_chunks WHERE context_version_id=$1 ORDER BY chunk_order',
      [draftV2.id]
    )).rows.map(comparableChunk);
    assert.deepEqual(copiedV2, sourceV1, 'Every approved chunk field must be copied into the new draft.');

    const duplicateReopen = await post('/reopen');
    assert.equal(duplicateReopen.status, 409);
    const afterRejectedDuplicate = await pool.query(
      'SELECT COUNT(*)::int AS count FROM lesson_context_versions WHERE lesson_id=$1',
      [lessonId]
    );
    assert.equal(afterRejectedDuplicate.rows[0].count, 2, 'A rejected reopen must not leave a partial version.');

    const approveV2 = await post('/approve');
    const approveBody = await approveV2.json();
    assert.equal(approveV2.status, 200, JSON.stringify(approveBody));
    assert.equal(approveBody.data.context.status, 'APPROVED');
    assert.equal(approveBody.data.context.versionNumber, 2);

    const approvedV2Chunks = (await pool.query(
      'SELECT * FROM lesson_context_chunks WHERE context_version_id=$1 ORDER BY chunk_order',
      [draftV2.id]
    )).rows.map(comparableChunk);
    const secondReopen = await post('/reopen');
    const secondBody = await secondReopen.json();
    assert.equal(secondReopen.status, 201, JSON.stringify(secondBody));
    assert.equal(secondBody.data.context.status, 'DRAFT');
    assert.equal(secondBody.data.context.versionNumber, 3);
    assert.equal(secondBody.data.context.chunks.length, approvedV2Chunks.length);

    const afterSecond = await pool.query(
      'SELECT * FROM lesson_context_versions WHERE lesson_id=$1 ORDER BY version_number',
      [lessonId]
    );
    assert.deepEqual(afterSecond.rows.map(row => row.status), ['ARCHIVED', 'APPROVED', 'DRAFT']);
    const copiedV3 = (await pool.query(
      'SELECT * FROM lesson_context_chunks WHERE context_version_id=$1 ORDER BY chunk_order',
      [afterSecond.rows[2].id]
    )).rows.map(comparableChunk);
    assert.deepEqual(copiedV3, approvedV2Chunks, 'The second reopen must copy the latest approved version.');

    console.log('PASS first reopen returns HTTP 201 with a new DRAFT version');
    console.log('PASS previously approved version remains approved while its draft is open');
    console.log('PASS every chunk field, including content_type, is copied');
    console.log('PASS duplicate reopen rolls back without a partial version');
    console.log('PASS approve then reopen creates the next draft from the latest approved version');
  } finally {
    if (server) await new Promise(resolve => server.close(resolve));
    if (lessonId) await pool.query('DELETE FROM lesson_sessions WHERE id=$1', [lessonId]);
    if (sectionId) await pool.query('DELETE FROM sections WHERE id=$1', [sectionId]);
    if (subjectId) await pool.query('DELETE FROM subjects WHERE id=$1', [subjectId]);
    if (instructorId) await pool.query('DELETE FROM users WHERE id=$1', [instructorId]);
    await pool.end();
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
