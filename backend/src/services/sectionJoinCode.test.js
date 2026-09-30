const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const pool = require('../db/pool');
const { authorizeActive } = require('../middleware/authorize');
const { generateCode, uniqueJoinCode } = require('../utils/joinCode');
const sections = require('./section.service');

const OWNER_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_ID = '22222222-2222-4222-8222-222222222222';
const SECTION_ID = '33333333-3333-4333-8333-333333333333';
const STUDENT_ID = '44444444-4444-4444-8444-444444444444';

test('join code generator preserves the existing unambiguous eight-character format and retries collisions', async () => {
  assert.match(generateCode(), /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{8}$/);
  let checks = 0;
  const code = await uniqueJoinCode({
    async query(sql, values) {
      assert.match(sql, /WHERE join_code = \$1/);
      assert.match(values[0], /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{8}$/);
      checks += 1;
      return { rows: checks === 1 ? [{ id: 'collision' }] : [] };
    },
  });
  assert.match(code, /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{8}$/);
  assert.equal(checks, 2);
});

test('owner regeneration replaces the code transactionally; old code fails and new code can join', async () => {
  const originalConnect = pool.connect;
  const originalQuery = pool.query;
  const record = {
    id: SECTION_ID,
    instructorId: OWNER_ID,
    joinCode: '4MKKA3CQ',
    sectionName: 'CPE-401',
    subjectCode: 'CALC2',
  };
  const oldCode = record.joinCode;
  const enrollment = { id: '55555555-5555-4555-8555-555555555555', section_id: SECTION_ID, student_id: STUDENT_ID, status: 'PENDING' };
  const transaction = [];

  const client = {
    release() { transaction.push('RELEASE'); },
    async query(sql, values = []) {
      if (/^(?:BEGIN|COMMIT|ROLLBACK)$/.test(sql)) {
        transaction.push(sql);
        return { rows: [] };
      }
      if (/FROM sections\s+WHERE id = \$1 AND instructor_id = \$2\s+FOR UPDATE/.test(sql)) {
        return { rows: values[0] === record.id && values[1] === record.instructorId
          ? [{ id: record.id, join_code: record.joinCode }]
          : [] };
      }
      if (/SELECT id FROM sections WHERE join_code = \$1/.test(sql)) {
        return { rows: values[0] === record.joinCode ? [{ id: record.id }] : [] };
      }
      if (/UPDATE sections\s+SET join_code = \$1/.test(sql)) {
        record.joinCode = values[0];
        return { rows: [{ id: record.id, join_code: record.joinCode }] };
      }
      throw new Error(`Unexpected transaction SQL: ${sql}`);
    },
  };

  pool.connect = async () => client;
  pool.query = async (sql, values = []) => {
    if (/WHERE s\.join_code = \$1/.test(sql)) {
      return { rows: values[0] === record.joinCode ? [{
        id: record.id,
        section_name: record.sectionName,
        subject_code: record.subjectCode,
        instructor_name: 'Professor Owner',
        instructor_status: 'ACTIVE',
      }] : [] };
    }
    if (/SELECT status FROM enrollments/.test(sql)) return { rows: [] };
    if (/SELECT s\.id, u\.status AS instructor_status/.test(sql)) {
      return { rows: [{ id: record.id, instructor_status: 'ACTIVE' }] };
    }
    if (/SELECT id, status FROM enrollments/.test(sql)) return { rows: [] };
    if (/INSERT INTO enrollments/.test(sql)) return { rows: [enrollment] };
    throw new Error(`Unexpected pool SQL: ${sql}`);
  };

  try {
    const result = await sections.regenerateJoinCode(SECTION_ID, OWNER_ID);
    assert.equal(result.id, SECTION_ID);
    assert.notEqual(result.joinCode, oldCode);
    assert.match(result.joinCode, /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{8}$/);
    assert.deepEqual(transaction.slice(0, 2), ['BEGIN', 'COMMIT']);

    await assert.rejects(
      sections.joinByCode(oldCode, STUDENT_ID),
      error => error.statusCode === 404,
    );
    const joined = await sections.joinByCode(result.joinCode, STUDENT_ID);
    assert.equal(joined.sectionId, SECTION_ID);
    assert.equal(joined.studentId, STUDENT_ID);
  } finally {
    pool.connect = originalConnect;
    pool.query = originalQuery;
  }
});

test('another instructor cannot regenerate an owned section and student role is denied by the route guard', async () => {
  const originalConnect = pool.connect;
  let rolledBack = false;
  pool.connect = async () => ({
    release() {},
    async query(sql) {
      if (sql === 'BEGIN') return { rows: [] };
      if (sql === 'ROLLBACK') { rolledBack = true; return { rows: [] }; }
      if (/FOR UPDATE/.test(sql)) return { rows: [] };
      throw new Error(`Unexpected SQL: ${sql}`);
    },
  });
  try {
    await assert.rejects(
      sections.regenerateJoinCode(SECTION_ID, OTHER_ID),
      error => error.statusCode === 404 && /access denied/i.test(error.message),
    );
    assert.equal(rolledBack, true);
  } finally {
    pool.connect = originalConnect;
  }

  let denied;
  authorizeActive('INSTRUCTOR')(
    { user: { role: 'STUDENT', status: 'ACTIVE' } },
    {},
    error => { denied = error; },
  );
  assert.equal(denied.statusCode, 403);

  const routeSource = fs.readFileSync(path.join(__dirname, '../routes/section.routes.js'), 'utf8');
  assert.match(routeSource, /post\('\/:sectionId\/regenerate-code', authenticate, authorizeActive\('INSTRUCTOR'\)/);
  const schema = fs.readFileSync(path.join(__dirname, '../db/schema.sql'), 'utf8');
  assert.match(schema, /CREATE UNIQUE INDEX IF NOT EXISTS sections_join_code_unique ON sections \(join_code\)/);
});
