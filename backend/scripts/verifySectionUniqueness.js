require('dotenv').config({ quiet: true });

const fs = require('fs');
const path = require('path');
const pool = require('../src/db/pool');
const { createSection } = require('../src/services/section.service');

const DUPLICATE_MESSAGE = 'A section with this name already exists for this subject.';

function joinCode() {
  return ('QA' + Math.random().toString(36).slice(2, 12)).toUpperCase().slice(0, 12);
}

async function insertSection(client, instructorId, subjectId, sectionName) {
  await client.query(
    `INSERT INTO sections (subject_id, instructor_id, section_name, join_code)
     VALUES ($1, $2, $3, $4)`,
    [subjectId, instructorId, sectionName, joinCode()]
  );
}

async function verifyAttempt(client, savepoint, label, operation, shouldSucceed) {
  await client.query('SAVEPOINT ' + savepoint);
  try {
    await operation();
    if (!shouldSucceed) throw new Error(label + ' unexpectedly succeeded.');
    console.log('PASS ' + label);
  } catch (error) {
    await client.query('ROLLBACK TO SAVEPOINT ' + savepoint);
    if (shouldSucceed) throw new Error(label + ' failed: ' + error.message);
    if (error.code !== '23505') throw new Error(label + ' failed with ' + (error.code || error.message) + ' instead of 23505.');
    console.log('PASS ' + label + ' rejected by unique index');
  }
}

async function main() {
  const migrationPath = path.join(__dirname, '../src/db/migration_section_instructor_uniqueness.sql');
  await pool.query(fs.readFileSync(migrationPath, 'utf8'));

  const { rows: indexes } = await pool.query(
    `SELECT indexname, indexdef
     FROM pg_indexes
     WHERE tablename = 'sections'
       AND (indexname LIKE '%subject%name%' OR indexname = 'unique_instructor_subject_section')
     ORDER BY indexname`
  );
  if (indexes.length !== 1 || indexes[0].indexname !== 'sections_instructor_subject_name_unique') {
    throw new Error('Unexpected section-name indexes: ' + JSON.stringify(indexes));
  }
  const compactDefinition = indexes[0].indexdef.replace(/\s+/g, ' ');
  if (!/instructor_id, subject_id, lower\(\(section_name\)::text\)/i.test(compactDefinition)) {
    throw new Error('Unexpected index definition: ' + compactDefinition);
  }
  console.log('PASS index definition: ' + compactDefinition);

  const { rows: instructors } = await pool.query(
    `SELECT id, email FROM users
     WHERE email = 'mariasantos1@instructor.com'`
  );
  const maria = instructors[0];
  if (!maria) throw new Error('Required instructor fixture is unavailable.');

  const { rows: subjects } = await pool.query(
    `SELECT id, code FROM subjects WHERE code IN ('CALC1', 'CALC2')`
  );
  const calc2 = subjects.find(row => row.code === 'CALC2');
  const otherSubject = subjects.find(row => row.code === 'CALC1');
  if (!calc2 || !otherSubject) throw new Error('Required CALC1/CALC2 fixtures are unavailable.');

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const fixtureEmailSuffix = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    const { rows: fixtureInstructors } = await client.query(
      `INSERT INTO users (first_name, last_name, email, password_hash, role, status)
       SELECT fixture.first_name, fixture.last_name, candidate.email, fixture.password_hash, 'INSTRUCTOR', 'ACTIVE'
       FROM users fixture
       CROSS JOIN (VALUES
         ($2::text),
         ($3::text)
       ) AS candidate(email)
       WHERE fixture.id = $1
       RETURNING id, email`,
      [
        maria.id,
        `section-uniqueness-a-${fixtureEmailSuffix}@example.invalid`,
        `section-uniqueness-b-${fixtureEmailSuffix}@example.invalid`,
      ]
    );
    const testInstructor = fixtureInstructors[0];
    const otherInstructor = fixtureInstructors[1];
    if (!testInstructor || !otherInstructor) throw new Error('Unable to create transaction-only instructor fixtures.');

    await verifyAttempt(client, 'case_cpe402', 'same instructor CALC2 CPE-402', () =>
      insertSection(client, testInstructor.id, calc2.id, 'CPE-402'), true);
    await verifyAttempt(client, 'case_cpe403', 'same instructor CALC2 CPE-403', () =>
      insertSection(client, testInstructor.id, calc2.id, 'CPE-403'), true);
    await insertSection(client, testInstructor.id, calc2.id, 'CPE-401');
    await verifyAttempt(client, 'case_exact_duplicate', 'same instructor CALC2 CPE-401', () =>
      insertSection(client, testInstructor.id, calc2.id, 'CPE-401'), false);
    await verifyAttempt(client, 'case_case_duplicate', 'same instructor CALC2 cpe-401', () =>
      insertSection(client, testInstructor.id, calc2.id, 'cpe-401'), false);
    await verifyAttempt(client, 'case_other_subject', 'same instructor other subject CPE-401', () =>
      insertSection(client, testInstructor.id, otherSubject.id, 'CPE-401'), true);
    await verifyAttempt(client, 'case_other_instructor', 'other instructor CALC2 CPE-401', () =>
      insertSection(client, otherInstructor.id, calc2.id, 'CPE-401'), true);
    await client.query('ROLLBACK');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }

  try {
    await createSection({
      instructorId: maria.id,
      subjectId: calc2.id,
      sectionName: 'cPe-401',
    });
    throw new Error('Service duplicate check unexpectedly allowed cPe-401.');
  } catch (error) {
    if (error.message !== DUPLICATE_MESSAGE || error.statusCode !== 409) throw error;
    console.log('PASS service returns the friendly duplicate message');
  }

  console.log('Section uniqueness verification completed; all inserted test rows were rolled back.');
}

main()
  .then(() => pool.end())
  .catch(async error => {
    console.error(error.stack || error.message);
    await pool.end();
    process.exit(1);
  });