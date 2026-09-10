const pool = require('../db/pool');
const AppError = require('../utils/AppError');
const { RECOGNITION_PROVIDER, GEMINI_MODEL, RECOGNITION_MAX_ATTEMPTS, RECOGNITION_RATE_LIMIT_BACKOFF_MS } = require('../config/env');

function safeRecognition(row) {
  if (!row?.recognition_id && !row?.id) return null;
  const id = row.recognition_id || row.id;
  const status = row.recognition_status || row.status;
  const structured = row.structured_result || null;
  return {
    id,
    captureId: row.capture_id,
    lessonId: row.lesson_id,
    sectionId: row.section_id,
    status,
    sourceVariant: row.source_variant || null,
    plainText: row.plain_text || '',
    mathExpressions: row.math_expressions || [],
    structuredResult: structured,
    provider: row.provider || null,
    providerVersion: row.provider_version || null,
    attemptCount: row.attempt_count || 0,
    resultAttemptNumber: row.result_attempt_number || null,
    hasPreviousResult: Boolean(structured) && ['PENDING', 'PROCESSING', 'FAILED'].includes(status),
    failureCode: row.last_failure_code || null,
    failureMessage: row.last_failure_message || null,
    requestedAt: row.requested_at || null,
    processedAt: row.processed_at || null,
    updatedAt: row.updated_at || null,
  };
}

function safeCaptureRecognition(row) {
  return {
    capture: {
      id: row.capture_id,
      lessonId: row.lesson_id,
      sectionId: row.section_id,
      capturedAt: row.captured_at,
      originalUrl: `/api/captures/${row.capture_id}/image/original`,
      correctedUrl: row.corrected_storage_key ? `/api/captures/${row.capture_id}/image/corrected` : null,
    },
    recognition: row.recognition_id ? safeRecognition(row) : null,
  };
}

async function getOwnedLesson(lessonId, instructorId, client = pool) {
  const { rows } = await client.query(
    'SELECT id, section_id, instructor_id, title, topic, status, started_at, ended_at FROM lesson_sessions WHERE id = $1',
    [lessonId]
  );
  if (!rows.length || rows[0].instructor_id !== instructorId) throw new AppError('Lesson not found or access denied.', 404);
  return rows[0];
}

async function getOwnedCapture(captureId, instructorId, client = pool) {
  const { rows } = await client.query(
    `SELECT capture.*, lesson.status AS lesson_status
       FROM lesson_captures capture
       JOIN lesson_sessions lesson ON lesson.id = capture.lesson_id
      WHERE capture.id = $1
        AND capture.instructor_id = $2
        AND lesson.instructor_id = $2
      FOR UPDATE OF capture`,
    [captureId, instructorId]
  );
  if (!rows.length) throw new AppError('Capture not found or access denied.', 404);
  return rows[0];
}

async function queueCapture(captureId, instructorId, { reprocess = false } = {}) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const capture = await getOwnedCapture(captureId, instructorId, client);
    if (capture.lesson_status !== 'COMPLETED') {
      throw new AppError('Whiteboard processing is available after the lesson is completed.', 409);
    }
    const existingResult = await client.query(
      'SELECT * FROM capture_recognitions WHERE capture_id = $1 FOR UPDATE',
      [captureId]
    );
    let recognition = existingResult.rows[0];

    if (recognition && ['PENDING', 'PROCESSING'].includes(recognition.status)) {
      await client.query('COMMIT');
      return { recognition: safeRecognition(recognition), queued: false };
    }
    if (recognition && !reprocess) {
      await client.query('COMMIT');
      return { recognition: safeRecognition(recognition), queued: false };
    }

    if (!recognition) {
      const inserted = await client.query(
        `INSERT INTO capture_recognitions
          (capture_id, lesson_id, section_id, instructor_id, status, provider, provider_version, attempt_count, requested_at, updated_at)
         VALUES ($1,$2,$3,$4,'PENDING',$5,$6,1,NOW(),NOW())
         RETURNING *`,
        [capture.id, capture.lesson_id, capture.section_id, instructorId, RECOGNITION_PROVIDER, GEMINI_MODEL]
      );
      recognition = inserted.rows[0];
      await client.query(
        `INSERT INTO capture_recognition_attempts
          (recognition_id, attempt_number, request_kind, status, provider, provider_version, next_attempt_at)
         VALUES ($1,1,'INITIAL','PENDING',$2,$3,NOW())`,
        [recognition.id, RECOGNITION_PROVIDER, GEMINI_MODEL]
      );
    } else {
      const nextAttempt = recognition.attempt_count + 1;
      const updated = await client.query(
        `UPDATE capture_recognitions
            SET status = 'PENDING', attempt_count = $2, requested_at = NOW(), updated_at = NOW(),
                last_failure_code = NULL, last_failure_message = NULL
          WHERE id = $1 RETURNING *`,
        [recognition.id, nextAttempt]
      );
      recognition = updated.rows[0];
      await client.query(
        `INSERT INTO capture_recognition_attempts
          (recognition_id, attempt_number, request_kind, status, provider, provider_version, next_attempt_at)
         VALUES ($1,$2,'REPROCESS','PENDING',$3,$4,NOW())`,
        [recognition.id, nextAttempt, RECOGNITION_PROVIDER, GEMINI_MODEL]
      );
    }
    await client.query('COMMIT');
    return { recognition: safeRecognition(recognition), queued: true };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function queueLesson(lessonId, instructorId) {
  const lesson = await getOwnedLesson(lessonId, instructorId);
  if (lesson.status !== 'COMPLETED') {
    throw new AppError('Whiteboard processing is available after the lesson is completed.', 409);
  }
  const { rows } = await pool.query(
    'SELECT id FROM lesson_captures WHERE lesson_id = $1 AND instructor_id = $2 ORDER BY captured_at ASC',
    [lessonId, instructorId]
  );
  const results = [];
  for (const capture of rows) results.push(await queueCapture(capture.id, instructorId));
  return {
    captureCount: rows.length,
    queuedCount: results.filter(item => item.queued).length,
    recognitions: results.map(item => item.recognition),
  };
}

async function getCaptureRecognition(captureId, instructorId) {
  await getOwnedCapture(captureId, instructorId);
  const { rows } = await pool.query(
    'SELECT * FROM capture_recognitions WHERE capture_id = $1 AND instructor_id = $2',
    [captureId, instructorId]
  );
  return rows.length ? safeRecognition(rows[0]) : null;
}

async function getLessonRecognitions(lessonId, instructorId) {
  const lesson = await getOwnedLesson(lessonId, instructorId);
  const { rows } = await pool.query(
    `SELECT capture.id AS capture_id, capture.lesson_id, capture.section_id, capture.captured_at,
            capture.corrected_storage_key,
            recognition.id AS recognition_id, recognition.status AS recognition_status,
            recognition.source_variant, recognition.plain_text, recognition.math_expressions,
            recognition.structured_result, recognition.provider, recognition.provider_version,
            recognition.attempt_count, recognition.result_attempt_number,
            recognition.last_failure_code, recognition.last_failure_message,
            recognition.requested_at, recognition.processed_at, recognition.updated_at
       FROM lesson_captures capture
       LEFT JOIN capture_recognitions recognition ON recognition.capture_id = capture.id
      WHERE capture.lesson_id = $1 AND capture.instructor_id = $2
      ORDER BY capture.captured_at ASC`,
    [lessonId, instructorId]
  );
  return {
    lesson: {
      id: lesson.id,
      sectionId: lesson.section_id,
      title: lesson.title,
      topic: lesson.topic,
      status: lesson.status,
      startedAt: lesson.started_at,
      endedAt: lesson.ended_at,
    },
    items: rows.map(safeCaptureRecognition),
  };
}

async function recoverStaleAttempts(timeoutMs) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `UPDATE capture_recognition_attempts
          SET status = 'PENDING', next_attempt_at = NOW(), worker_id = NULL, locked_at = NULL,
              failure_code = 'WORKER_INTERRUPTED', failure_message = 'Recognition worker was interrupted.'
        WHERE status = 'PROCESSING' AND locked_at < NOW() - ($1::bigint * INTERVAL '1 millisecond')
        RETURNING recognition_id`,
      [timeoutMs]
    );
    if (rows.length) {
      await client.query(
        `UPDATE capture_recognitions SET status = 'PENDING', updated_at = NOW()
          WHERE id = ANY($1::uuid[]) AND status = 'PROCESSING'`,
        [rows.map(row => row.recognition_id)]
      );
    }
    await client.query('COMMIT');
    return rows.length;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally { client.release(); }
}

async function claimNextAttempt(workerId) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `SELECT attempt.id
         FROM capture_recognition_attempts attempt
        WHERE attempt.status = 'PENDING' AND attempt.next_attempt_at <= NOW()
        ORDER BY attempt.next_attempt_at, attempt.created_at
        FOR UPDATE SKIP LOCKED LIMIT 1`
    );
    if (!rows.length) {
      await client.query('COMMIT');
      return null;
    }
    const result = await client.query(
      `UPDATE capture_recognition_attempts
          SET status = 'PROCESSING', worker_id = $2, locked_at = NOW(), started_at = COALESCE(started_at, NOW())
        WHERE id = $1 RETURNING *`,
      [rows[0].id, workerId]
    );
    await client.query(
      `UPDATE capture_recognitions SET status = 'PROCESSING', updated_at = NOW()
        WHERE id = $1`,
      [result.rows[0].recognition_id]
    );
    await client.query('COMMIT');
    return result.rows[0];
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally { client.release(); }
}

async function getAttemptSource(attemptId) {
  const { rows } = await pool.query(
    `SELECT attempt.*, recognition.capture_id, recognition.lesson_id, recognition.section_id,
            recognition.instructor_id, capture.captured_at, capture.original_storage_key,
            capture.corrected_storage_key, capture.original_width, capture.original_height,
            capture.corrected_width, capture.corrected_height
       FROM capture_recognition_attempts attempt
       JOIN capture_recognitions recognition ON recognition.id = attempt.recognition_id
       JOIN lesson_captures capture ON capture.id = recognition.capture_id
       JOIN lesson_sessions lesson ON lesson.id = recognition.lesson_id
      WHERE attempt.id = $1
        AND capture.lesson_id = recognition.lesson_id
        AND capture.section_id = recognition.section_id
        AND capture.instructor_id = recognition.instructor_id
        AND lesson.instructor_id = recognition.instructor_id`,
    [attemptId]
  );
  if (!rows.length) {
    const error = new Error('Recognition ownership or capture metadata does not match.');
    error.code = 'OWNERSHIP_MISMATCH';
    throw error;
  }
  const planes = await pool.query(
    `SELECT id, calibration_plane_id, label, plane_order, corners, storage_key, mime_type, width, height
       FROM lesson_capture_planes WHERE capture_id = $1 ORDER BY plane_order`,
    [rows[0].capture_id]
  );
  return { ...rows[0], planes: planes.rows };
}

async function completeAttempt(attempt, result, source) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const current = await client.query('SELECT status FROM capture_recognition_attempts WHERE id = $1 FOR UPDATE', [attempt.id]);
    if (current.rows[0]?.status !== 'PROCESSING') throw new Error('Recognition attempt is no longer processing.');
    await client.query(
      `UPDATE capture_recognition_attempts
          SET status = 'SUCCEEDED', provider_version = $2, normalized_result = $3,
              sanitized_provider_output = $4, completed_at = NOW()
        WHERE id = $1`,
      [attempt.id, result.providerVersion, result.normalized, result.sanitizedOutput]
    );
    const structuredResult = {
      schemaVersion: 1,
      captureId: source.capture_id,
      lessonId: source.lesson_id,
      sectionId: source.section_id,
      instructorId: source.instructor_id,
      capturedAt: source.captured_at,
      source: {
        variant: source.sourceVariant,
        sha256: source.sha256,
        width: source.sourceWidth,
        height: source.sourceHeight,
      },
      provider: RECOGNITION_PROVIDER,
      providerVersion: result.providerVersion,
      ...result.normalized,
    };
    await client.query(
      `UPDATE capture_recognitions
          SET status = 'REVIEW_REQUIRED', source_variant = $2, source_sha256 = $3,
              source_width = $4, source_height = $5, plain_text = $6, math_expressions = $7,
              structured_result = $8, provider = $9, provider_version = $10,
              result_attempt_number = $11, last_failure_code = NULL, last_failure_message = NULL,
              processed_at = NOW(), updated_at = NOW()
        WHERE id = $1`,
      [attempt.recognition_id, source.sourceVariant, source.sha256, source.sourceWidth,
       source.sourceHeight, result.normalized.plainText, JSON.stringify(result.normalized.mathExpressions),
       JSON.stringify(structuredResult), RECOGNITION_PROVIDER, result.providerVersion, attempt.attempt_number]
    );
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally { client.release(); }
}

async function failAttempt(attempt, mappedError) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const current = await client.query('SELECT * FROM capture_recognition_attempts WHERE id = $1 FOR UPDATE', [attempt.id]);
    if (current.rows[0]?.status !== 'PROCESSING') {
      await client.query('COMMIT');
      return;
    }
    const chain = await client.query(
      `SELECT COUNT(*)::int AS count
         FROM capture_recognition_attempts
        WHERE recognition_id = $1
          AND created_at >= (
            SELECT MAX(created_at) FROM capture_recognition_attempts
             WHERE recognition_id = $1 AND request_kind IN ('INITIAL', 'REPROCESS')
          )`,
      [attempt.recognition_id]
    );
    const requestAttemptCount = chain.rows[0].count;

    await client.query(
      `UPDATE capture_recognition_attempts
          SET status = 'FAILED', failure_code = $2, failure_message = $3, completed_at = NOW()
        WHERE id = $1`,
      [attempt.id, mappedError.code, mappedError.message]
    );
    if (mappedError.retryable && requestAttemptCount < RECOGNITION_MAX_ATTEMPTS) {
      const nextAttempt = attempt.attempt_number + 1;
      const delaySeconds = mappedError.code === 'PROVIDER_RATE_LIMITED'
        ? Math.ceil(RECOGNITION_RATE_LIMIT_BACKOFF_MS / 1000)
        : requestAttemptCount === 1 ? 5 : 30;
      await client.query(
        `INSERT INTO capture_recognition_attempts
          (recognition_id, attempt_number, request_kind, status, provider, provider_version, next_attempt_at)
         VALUES ($1,$2,'AUTO_RETRY','PENDING',$3,$4,NOW() + ($5::int * INTERVAL '1 second'))`,
        [attempt.recognition_id, nextAttempt, RECOGNITION_PROVIDER, GEMINI_MODEL, delaySeconds]
      );
      await client.query(
        `UPDATE capture_recognitions
            SET status = 'PENDING', attempt_count = $2, last_failure_code = $3,
                last_failure_message = $4, updated_at = NOW()
          WHERE id = $1`,
        [attempt.recognition_id, nextAttempt, mappedError.code, mappedError.message]
      );
    } else {
      await client.query(
        `UPDATE capture_recognitions
            SET status = 'FAILED', last_failure_code = $2, last_failure_message = $3, updated_at = NOW()
          WHERE id = $1`,
        [attempt.recognition_id, mappedError.code, mappedError.message]
      );
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally { client.release(); }
}

module.exports = {
  queueCapture,
  queueLesson,
  getCaptureRecognition,
  getLessonRecognitions,
  recoverStaleAttempts,
  claimNextAttempt,
  getAttemptSource,
  completeAttempt,
  failAttempt,
};
