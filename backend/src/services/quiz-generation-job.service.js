const pool = require('../db/pool');

const RETRYABLE_CODES = new Set([
  'QUIZ_TIMEOUT', 'QUIZ_JOB_TIMEOUT', 'QUIZ_AI_TIMEOUT', 'QUIZ_AI_REQUEST_FAILED', 'PROVIDER_TIMEOUT',
  'PROVIDER_UNAVAILABLE', 'RATE_LIMITED', 'PROVIDER_RATE_LIMITED',
  '40001', '40P01', '57P01',
]);

function safeText(value, max = 300) {
  return String(value || '').replace(/[\r\n\t]+/g, ' ').trim().slice(0, max);
}

function safeJob(row) {
  if (!row) return null;
  return {
    id: row.id,
    generationId: row.generation_id,
    lessonId: row.lesson_id,
    conversationId: row.session_id,
    status: row.status,
    phase: row.phase,
    attemptCount: Number(row.attempt_count || 0),
    maxAttempts: Number(row.max_attempts || 0),
    quizId: row.quiz_id || null,
    options: {
      prompt: row.prompt || '',
      difficulty: row.difficulty || null,
      questionCount: Number(row.question_count || 0) || null,
      questionType: row.question_type || null,
      generationId: row.generation_id,
    },
    failure: row.status === 'FAILED' ? {
      code: row.failure_code || 'QUIZ_GENERATION_FAILED',
      message: row.failure_message || 'Quiz generation could not be completed. Please try again.',
    } : null,
    requestedAt: row.requested_at,
    startedAt: row.started_at,
    completedAt: row.completed_at,
  };
}

async function enqueue(input, db = pool) {
  const { rows } = await db.query(
    `INSERT INTO quiz_generation_jobs(
       generation_id,lesson_id,context_version_id,instructor_id,session_id,prompt,
       difficulty,question_count,question_type,skip_user_message,max_attempts
     ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
     ON CONFLICT(lesson_id,instructor_id,generation_id) DO UPDATE SET
       status=CASE WHEN quiz_generation_jobs.status='FAILED' THEN 'PENDING' ELSE quiz_generation_jobs.status END,
       phase=CASE WHEN quiz_generation_jobs.status='FAILED' THEN 'QUEUED' ELSE quiz_generation_jobs.phase END,
       attempt_count=CASE WHEN quiz_generation_jobs.status='FAILED' THEN 0 ELSE quiz_generation_jobs.attempt_count END,
       next_attempt_at=CASE WHEN quiz_generation_jobs.status='FAILED' THEN NOW() ELSE quiz_generation_jobs.next_attempt_at END,
       worker_id=CASE WHEN quiz_generation_jobs.status='FAILED' THEN NULL ELSE quiz_generation_jobs.worker_id END,
       locked_at=CASE WHEN quiz_generation_jobs.status='FAILED' THEN NULL ELSE quiz_generation_jobs.locked_at END,
       failure_code=CASE WHEN quiz_generation_jobs.status='FAILED' THEN NULL ELSE quiz_generation_jobs.failure_code END,
       failure_message=CASE WHEN quiz_generation_jobs.status='FAILED' THEN NULL ELSE quiz_generation_jobs.failure_message END,
       updated_at=CASE WHEN quiz_generation_jobs.status='FAILED' THEN NOW() ELSE quiz_generation_jobs.updated_at END
     RETURNING *`,
    [input.generationId, input.lessonId, input.contextVersionId, input.instructorId,
      input.sessionId, input.prompt, input.difficulty, input.questionCount,
      input.questionType, input.skipUserMessage === true, input.maxAttempts],
  );
  return safeJob(rows[0]);
}

async function getOwned(jobId, lessonId, instructorId) {
  const { rows } = await pool.query(
    'SELECT * FROM quiz_generation_jobs WHERE id=$1 AND lesson_id=$2 AND instructor_id=$3',
    [jobId, lessonId, instructorId],
  );
  return safeJob(rows[0]);
}

async function getActive(lessonId, instructorId) {
  const { rows } = await pool.query(
    `SELECT * FROM quiz_generation_jobs
     WHERE lesson_id=$1 AND instructor_id=$2
     ORDER BY requested_at DESC LIMIT 1`,
    [lessonId, instructorId],
  );
  return rows[0]?.status === 'COMPLETED' ? null : safeJob(rows[0]);
}

async function recoverStale(timeoutMs) {
  const { rowCount } = await pool.query(
    `UPDATE quiz_generation_jobs SET
       status=CASE WHEN attempt_count < max_attempts THEN 'PENDING' ELSE 'FAILED' END,
       phase=CASE WHEN attempt_count < max_attempts THEN 'QUEUED' ELSE 'FAILED' END,
       next_attempt_at=CASE WHEN attempt_count < max_attempts THEN NOW() ELSE next_attempt_at END,
       failure_code=CASE WHEN attempt_count < max_attempts THEN NULL ELSE 'QUIZ_JOB_STALE' END,
       failure_message=CASE WHEN attempt_count < max_attempts THEN NULL ELSE 'Quiz generation stopped before completion. Please retry.' END,
       worker_id=NULL,locked_at=NULL,updated_at=NOW()
     WHERE status='PROCESSING' AND locked_at < NOW() - ($1::bigint * INTERVAL '1 millisecond')`,
    [timeoutMs],
  );
  return rowCount;
}

async function claimNext(workerId) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `WITH candidate AS (
         SELECT id FROM quiz_generation_jobs
         WHERE status='PENDING' AND next_attempt_at <= NOW()
         ORDER BY next_attempt_at,requested_at
         FOR UPDATE SKIP LOCKED LIMIT 1
       )
       UPDATE quiz_generation_jobs j SET status='PROCESSING',phase='GENERATING',
         worker_id=$1,locked_at=NOW(),started_at=COALESCE(started_at,NOW()),
         attempt_count=attempt_count+1,updated_at=NOW()
       FROM candidate WHERE j.id=candidate.id RETURNING j.*`,
      [workerId],
    );
    await client.query('COMMIT');
    return rows[0] || null;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function updatePhase(jobId, workerId, phase) {
  await pool.query(
    `UPDATE quiz_generation_jobs SET phase=$3,updated_at=NOW()
     WHERE id=$1 AND worker_id=$2 AND status='PROCESSING'`,
    [jobId, workerId, phase],
  );
}

async function markCompleted(client, jobId, quizId) {
  const result = await client.query(
    `UPDATE quiz_generation_jobs SET status='COMPLETED',phase='COMPLETED',quiz_id=$2,
       completed_at=NOW(),worker_id=NULL,locked_at=NULL,failure_code=NULL,failure_message=NULL,updated_at=NOW()
     WHERE id=$1 AND status='PROCESSING' RETURNING *`,
    [jobId, quizId],
  );
  if (!result.rows.length) throw new Error('Quiz generation job is no longer processing.');
  return safeJob(result.rows[0]);
}

function retryable(error) {
  const code = safeText(error?.code, 80);
  return RETRYABLE_CODES.has(code) || /timeout|temporar|rate.?limit|ECONNRESET|ETIMEDOUT/i.test(`${code} ${error?.message || ''}`);
}

async function fail(job, error) {
  const candidateCode = safeText(error?.code, 80);
  const code = /^[A-Z][A-Z0-9_]{2,79}$/.test(candidateCode) ? candidateCode : 'QUIZ_GENERATION_FAILED';
  const message = error?.isOperational || candidateCode
    ? safeText(error?.message || 'Quiz generation could not be completed. Please try again.')
    : 'Quiz generation could not be completed. Please try again.';
  const shouldRetry = retryable(error) && Number(job.attempt_count) < Number(job.max_attempts);
  const delaySeconds = Math.min(30, Math.max(2, Number(job.attempt_count || 1) * 5));
  const { rows } = await pool.query(
    `UPDATE quiz_generation_jobs SET status=$3,phase=$4,
       next_attempt_at=CASE WHEN $3='PENDING' THEN NOW()+($5::integer*INTERVAL '1 second') ELSE next_attempt_at END,
       worker_id=NULL,locked_at=NULL,failure_code=$6,failure_message=$7,
       completed_at=CASE WHEN $3='FAILED' THEN NOW() ELSE NULL END,updated_at=NOW()
     WHERE id=$1 AND worker_id=$2 AND status='PROCESSING' RETURNING *`,
    [job.id, job.worker_id, shouldRetry ? 'PENDING' : 'FAILED', shouldRetry ? 'QUEUED' : 'FAILED', delaySeconds, code, message],
  );
  return safeJob(rows[0]);
}

module.exports = { claimNext, enqueue, fail, getActive, getOwned, markCompleted, recoverStale, retryable, safeJob, updatePhase };
