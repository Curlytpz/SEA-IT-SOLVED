const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
require('../src/config/env');
const pool = require('../src/db/pool');
const contextService = require('../src/services/lesson-context.service');

async function main() {
  const suffix = crypto.randomBytes(6).toString('hex');
  const ids = {};
  try {
    const readiness = await import(pathToFileURL(path.resolve(__dirname, '../../frontend/src/utils/lessonContextReadiness.js')));
    const gate = readiness.createLessonContextDraftGate();
    const pendingLesson = { id: 'fixture', status: 'COMPLETED', workflow: { recognitionStatus: 'PROCESSING' } };
    const readyLesson = { id: 'fixture', status: 'COMPLETED', workflow: { recognitionStatus: 'REVIEW_REQUIRED' } };
    const pending = readiness.lessonContextReadiness(pendingLesson);
    const ready = readiness.lessonContextReadiness(readyLesson);
    assert.equal(pending.processing, true);
    assert.equal(ready.canPrepare, true);
    assert.equal(gate.start(pending.signature), true);
    gate.finish();
    assert.equal(gate.start(pending.signature), false);
    gate.observe(ready.signature);
    assert.equal(gate.start(ready.signature), true);
    gate.finish();

    ids.instructor = (await pool.query(
      "INSERT INTO users(first_name,last_name,email,password_hash,role,status) VALUES('Context','Readiness',$1,'verification-only','INSTRUCTOR','ACTIVE') RETURNING id",
      [`context-readiness-${suffix}@hau.edu.ph`],
    )).rows[0].id;
    ids.subject = (await pool.query(
      "INSERT INTO subjects(code,name) VALUES($1,'Context readiness verification') RETURNING id",
      [`CR${suffix}`],
    )).rows[0].id;
    ids.section = (await pool.query(
      "INSERT INTO sections(subject_id,instructor_id,section_name,join_code) VALUES($1,$2,'Context readiness',$3) RETURNING id",
      [ids.subject, ids.instructor, suffix.toUpperCase()],
    )).rows[0].id;
    ids.lesson = (await pool.query(
      "INSERT INTO lesson_sessions(section_id,instructor_id,title,status,started_at,ended_at) VALUES($1,$2,'Context readiness lesson','COMPLETED',NOW()-INTERVAL '5 minutes',NOW()) RETURNING id",
      [ids.section, ids.instructor],
    )).rows[0].id;
    await pool.query(
      "INSERT INTO lesson_recognitions(lesson_id,section_id,instructor_id,status,pages) VALUES($1,$2,$3,'PROCESSING',$4)",
      [ids.lesson, ids.section, ids.instructor, JSON.stringify([{ pageNumber: 1, plainText: 'Derivative review', blocks: [{ type: 'math', latex: '\\frac{d}{dx}x^2=2x' }] }])],
    );

    await assert.rejects(
      () => contextService.buildDraft(ids.lesson, ids.instructor),
      error => error.statusCode === 409 && /still processing/i.test(error.message),
    );
    assert.equal(Number((await pool.query("SELECT COUNT(*) count FROM lesson_context_versions WHERE lesson_id=$1 AND status='DRAFT'", [ids.lesson])).rows[0].count), 0);

    await pool.query("UPDATE lesson_recognitions SET status='REVIEW_REQUIRED' WHERE lesson_id=$1", [ids.lesson]);
    const [first, second] = await Promise.all([
      contextService.buildDraft(ids.lesson, ids.instructor),
      contextService.buildDraft(ids.lesson, ids.instructor),
    ]);
    assert.equal(first.context.id, second.context.id, 'Concurrent builders must reuse one draft.');
    assert.equal(Number((await pool.query("SELECT COUNT(*) count FROM lesson_context_versions WHERE lesson_id=$1 AND status='DRAFT'", [ids.lesson])).rows[0].count), 1);

    console.log('PASS processing guard, one automatic attempt per workflow state, and concurrent draft reuse');
  } finally {
    if (ids.lesson) await pool.query('DELETE FROM lesson_sessions WHERE id=$1', [ids.lesson]);
    if (ids.section) await pool.query('DELETE FROM sections WHERE id=$1', [ids.section]);
    if (ids.subject) await pool.query('DELETE FROM subjects WHERE id=$1', [ids.subject]);
    if (ids.instructor) await pool.query('DELETE FROM users WHERE id=$1', [ids.instructor]);
    await pool.end();
  }
}

main().catch(error => {
  console.error('LESSON CONTEXT READINESS: FAIL', error.message);
  process.exitCode = 1;
});

