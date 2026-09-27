const assert = require('node:assert/strict');
const test = require('node:test');
const pool = require('../db/pool');
const service = require('./quiz-generation-job.service');

function row(overrides = {}) {
  return {
    id: 'job-1', generation_id: 'generation-1', lesson_id: 'lesson-1',
    context_version_id: 'context-1', instructor_id: 'instructor-1', session_id: 'session-1',
    status: 'PENDING', phase: 'QUEUED', attempt_count: 0, max_attempts: 2,
    requested_at: new Date(), ...overrides,
  };
}

test('same generation id is enqueued idempotently', async () => {
  const calls = [];
  const db = { query: async (sql, values) => { calls.push({ sql, values }); return { rows: [row()] }; } };
  const input = { generationId: 'generation-1', lessonId: 'lesson-1', contextVersionId: 'context-1',
    instructorId: 'instructor-1', sessionId: 'session-1', prompt: 'Generate a quiz', difficulty: 'MEDIUM',
    questionCount: 5, questionType: 'MIXED', maxAttempts: 2 };
  const first = await service.enqueue(input, db);
  const second = await service.enqueue(input, db);
  assert.equal(first.id, second.id);
  assert.match(calls[0].sql, /ON CONFLICT\(lesson_id,instructor_id,generation_id\)/);
  assert.equal(calls.length, 2);
});

test('SKIP LOCKED claiming permits only one worker to receive a queued job', async () => {
  const originalConnect = pool.connect;
  let claimed = false;
  const sql = [];
  pool.connect = async () => ({
    query: async statement => {
      sql.push(statement);
      if (/UPDATE quiz_generation_jobs j/.test(statement)) {
        if (claimed) return { rows: [] };
        claimed = true;
        return { rows: [row({ status: 'PROCESSING', phase: 'GENERATING', attempt_count: 1, worker_id: 'worker-a' })] };
      }
      return { rows: [] };
    },
    release() {},
  });
  try {
    const [first, second] = await Promise.all([service.claimNext('worker-a'), service.claimNext('worker-b')]);
    assert.equal([first, second].filter(Boolean).length, 1);
    assert.match(sql.find(value => /SKIP LOCKED/.test(value)), /FOR UPDATE SKIP LOCKED/);
  } finally { pool.connect = originalConnect; }
});

test('retryable failures return a claimed job to PENDING and terminal failures become FAILED', async () => {
  const originalQuery = pool.query;
  const statuses = [];
  pool.query = async (_sql, values) => {
    statuses.push(values[2]);
    return { rows: [row({ status: values[2], phase: values[3], attempt_count: 1,
      failure_code: values[5], failure_message: values[6] })] };
  };
  try {
    const retry = await service.fail(row({ status: 'PROCESSING', attempt_count: 1, worker_id: 'worker-a' }), { code: 'QUIZ_TIMEOUT', message: 'Timed out' });
    const terminal = await service.fail(row({ status: 'PROCESSING', attempt_count: 2, worker_id: 'worker-a' }), { code: 'QUIZ_AI_RESPONSE_INVALID', message: 'Invalid output' });
    assert.equal(retry.status, 'PENDING');
    assert.equal(terminal.status, 'FAILED');
    assert.deepEqual(statuses, ['PENDING', 'FAILED']);
  } finally { pool.query = originalQuery; }
});

test('two provider timeouts produce one retry and then a terminal QUIZ_AI_TIMEOUT failure', async () => {
  const originalQuery = pool.query;
  const statuses = [];
  pool.query = async (_sql, values) => {
    statuses.push(values[2]);
    return { rows: [row({
      status: values[2], phase: values[3], attempt_count: statuses.length,
      failure_code: values[5], failure_message: values[6],
    })] };
  };
  try {
    const first = await service.fail(row({ status: 'PROCESSING', attempt_count: 1, worker_id: 'worker-a' }), {
      code: 'QUIZ_AI_TIMEOUT', message: 'Quiz generation took too long.',
    });
    const second = await service.fail(row({ status: 'PROCESSING', attempt_count: 2, worker_id: 'worker-a' }), {
      code: 'QUIZ_AI_TIMEOUT', message: 'Quiz generation took too long.',
    });
    assert.equal(first.status, 'PENDING');
    assert.equal(second.status, 'FAILED');
    assert.equal(second.failure.code, 'QUIZ_AI_TIMEOUT');
    assert.deepEqual(statuses, ['PENDING', 'FAILED']);
  } finally { pool.query = originalQuery; }
});

test('stale PROCESSING jobs are recovered with bounded attempts', async () => {
  const originalQuery = pool.query;
  let statement = '';
  pool.query = async sql => { statement = sql; return { rowCount: 2 }; };
  try {
    assert.equal(await service.recoverStale(600000), 2);
    assert.match(statement, /attempt_count < max_attempts/);
    assert.match(statement, /status='PROCESSING'/);
  } finally { pool.query = originalQuery; }
});
