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

function failureResult(sql, values, attemptCount = 1) {
  const pending = /status='PENDING'/.test(sql);
  return { rows: [row({
    status: pending ? 'PENDING' : 'FAILED',
    phase: pending ? 'QUEUED' : 'FAILED',
    attempt_count: attemptCount,
    worker_id: null,
    locked_at: null,
    failure_code: pending ? values[3] : values[2],
    failure_message: pending ? values[4] : values[3],
  })] };
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
  pool.query = async (sql, values) => {
    statuses.push(/status='PENDING'/.test(sql) ? 'PENDING' : 'FAILED');
    return failureResult(sql, values);
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
  pool.query = async (sql, values) => {
    statuses.push(/status='PENDING'/.test(sql) ? 'PENDING' : 'FAILED');
    return failureResult(sql, values, statuses.length);
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

test('first provider rate limit safely requeues with a bounded delay and clears the worker lock', async () => {
  const originalQuery = pool.query;
  let call;
  pool.query = async (sql, values) => {
    call = { sql, values };
    return failureResult(sql, values);
  };
  try {
    const result = await service.fail(row({
      status: 'PROCESSING', attempt_count: 1, max_attempts: 2, worker_id: 'worker-a', locked_at: new Date(),
    }), { code: 'PROVIDER_RATE_LIMITED', message: 'Quiz generation is temporarily rate-limited.' });
    assert.equal(result.status, 'PENDING');
    assert.equal(result.phase, 'QUEUED');
    assert.equal(call.values[2], 5);
    assert.match(call.sql, /next_attempt_at=NOW\(\)\+\(\$3::integer\*INTERVAL '1 second'\)/);
    assert.match(call.sql, /worker_id=NULL,locked_at=NULL/);
  } finally { pool.query = originalQuery; }
});

test('retry SQL does not reuse one parameter as incompatible status and delay types', async () => {
  const originalQuery = pool.query;
  let statement = '';
  pool.query = async (sql, values) => {
    statement = sql;
    return failureResult(sql, values);
  };
  try {
    await service.fail(row({ status: 'PROCESSING', attempt_count: 1, max_attempts: 2, worker_id: 'worker-a' }), {
      code: 'PROVIDER_RATE_LIMITED', message: 'Rate limited.',
    });
    assert.doesNotMatch(statement, /status=\$3|WHEN \$3=/);
    assert.equal((statement.match(/\$3/g) || []).length, 1);
    assert.match(statement, /\$3::integer/);
    assert.match(statement, /\$4::varchar\(80\)/);
    assert.match(statement, /\$5::text/);
  } finally { pool.query = originalQuery; }
});

test('final provider rate limit marks the job FAILED with a safe failure code', async () => {
  const originalQuery = pool.query;
  let statement = '';
  pool.query = async (sql, values) => {
    statement = sql;
    return failureResult(sql, values, 2);
  };
  try {
    const result = await service.fail(row({ status: 'PROCESSING', attempt_count: 2, max_attempts: 2, worker_id: 'worker-a' }), {
      code: 'PROVIDER_RATE_LIMITED', message: 'Quiz generation is temporarily rate-limited.',
    });
    assert.equal(result.status, 'FAILED');
    assert.equal(result.failure.code, 'PROVIDER_RATE_LIMITED');
    assert.match(statement, /status='FAILED',phase='FAILED'/);
    assert.match(statement, /worker_id=NULL,locked_at=NULL/);
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
