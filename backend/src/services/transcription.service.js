const pool = require('../db/pool');
const AppError = require('../utils/AppError');
const { publicTranscriptionError } = require('../transcription/transcriptionErrorMapper');
const { createTimelineMapper, TIMING_MAPPING_VERSION } = require('../transcription/transcriptionTimelineMapper');
const {
  TRANSCRIPTION_PROVIDER,
  GEMINI_TRANSCRIPTION_MODEL,
  TRANSCRIPTION_MAX_ATTEMPTS,
  GEMINI_SHARED_RATE_LIMIT_BACKOFF_MS,
} = require('../config/env');

function safeRecording(row, pauses = []) {
  if (!row?.recording_id) return null;
  return {
    id: row.recording_id,
    lessonId: row.lesson_id,
    sectionId: row.section_id,
    mimeType: row.mime_type,
    fileSize: Number(row.file_size),
    durationMs: Number(row.duration_ms),
    startedAt: row.recording_started_at,
    completedAt: row.recording_completed_at,
    audioUrl: `/api/audio-recordings/${row.recording_id}/audio`,
    pauses: pauses.map(item => ({ pausedAt: item.paused_at, resumedAt: item.resumed_at })),
  };
}

function safeTranscription(row) {
  if (!row?.transcription_id && !row?.id) return null;
  return {
    id: row.transcription_id || row.id,
    recordingId: row.recording_id,
    lessonId: row.lesson_id,
    sectionId: row.section_id,
    status: row.transcription_status || row.status,
    language: row.language || null,
    transcriptText: row.transcript_text || '',
    segments: row.segments || [],
    structuredResult: row.structured_result || null,
    provider: row.provider || null,
    providerVersion: row.provider_version || null,
    attemptCount: row.attempt_count || 0,
    resultAttemptNumber: row.result_attempt_number || null,
    hasPreviousResult: Boolean(row.structured_result) && ['PENDING', 'PROCESSING', 'FAILED'].includes(row.transcription_status || row.status),
    failureCode: row.last_failure_code || null,
    failureMessage: row.last_failure_code || row.last_failure_message ? publicTranscriptionError(row.last_failure_code) : null,
    requestedAt: row.requested_at || null,
    processedAt: row.processed_at || null,
    updatedAt: row.updated_at || null,
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

async function queueLessonTranscription(lessonId, instructorId, { reprocess = false } = {}) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const lesson = await getOwnedLesson(lessonId, instructorId, client);
    if (lesson.status !== 'COMPLETED') throw new AppError('Audio transcription is available after the lesson is completed.', 409);
    const recordingResult = await client.query(
      'SELECT * FROM lesson_audio_recordings WHERE lesson_id = $1 AND instructor_id = $2 FOR UPDATE',
      [lessonId, instructorId]
    );
    if (!recordingResult.rows.length) throw new AppError('This lesson does not have a saved audio recording.', 409);
    const recording = recordingResult.rows[0];
    const existingResult = await client.query('SELECT * FROM lesson_transcriptions WHERE recording_id = $1 FOR UPDATE', [recording.id]);
    let transcription = existingResult.rows[0];
    if (transcription && ['PENDING', 'PROCESSING'].includes(transcription.status)) {
      await client.query('COMMIT');
      return { transcription: safeTranscription(transcription), queued: false };
    }
    if (transcription && !reprocess) {
      await client.query('COMMIT');
      return { transcription: safeTranscription(transcription), queued: false };
    }
    if (!transcription) {
      const inserted = await client.query(
        `INSERT INTO lesson_transcriptions
          (recording_id, lesson_id, section_id, instructor_id, status, provider, provider_version, attempt_count, requested_at, updated_at)
         VALUES ($1,$2,$3,$4,'PENDING',$5,$6,1,NOW(),NOW()) RETURNING *`,
        [recording.id, lesson.id, lesson.section_id, instructorId, TRANSCRIPTION_PROVIDER, GEMINI_TRANSCRIPTION_MODEL]
      );
      transcription = inserted.rows[0];
      await client.query(
        `INSERT INTO lesson_transcription_attempts
          (transcription_id, attempt_number, request_kind, status, provider, provider_version, next_attempt_at)
         VALUES ($1,1,'INITIAL','PENDING',$2,$3,NOW())`,
        [transcription.id, TRANSCRIPTION_PROVIDER, GEMINI_TRANSCRIPTION_MODEL]
      );
    } else {
      const nextAttempt = transcription.attempt_count + 1;
      const updated = await client.query(
        `UPDATE lesson_transcriptions
            SET status='PENDING', attempt_count=$2, requested_at=NOW(), updated_at=NOW(),
                last_failure_code=NULL, last_failure_message=NULL
          WHERE id=$1 RETURNING *`,
        [transcription.id, nextAttempt]
      );
      transcription = updated.rows[0];
      await client.query(
        `INSERT INTO lesson_transcription_attempts
          (transcription_id, attempt_number, request_kind, status, provider, provider_version, next_attempt_at)
         VALUES ($1,$2,'REPROCESS','PENDING',$3,$4,NOW())`,
        [transcription.id, nextAttempt, TRANSCRIPTION_PROVIDER, GEMINI_TRANSCRIPTION_MODEL]
      );
    }
    await client.query('COMMIT');
    return { transcription: safeTranscription(transcription), queued: true };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally { client.release(); }
}

async function getLessonTranscription(lessonId, instructorId) {
  const lesson = await getOwnedLesson(lessonId, instructorId);
  const { rows } = await pool.query(
    `SELECT recording.id AS recording_id, recording.lesson_id, recording.section_id, recording.mime_type, recording.file_size, recording.duration_ms,
            recording.started_at AS recording_started_at, recording.completed_at AS recording_completed_at,
            transcription.id AS transcription_id, transcription.status AS transcription_status,
            transcription.language, transcription.transcript_text, transcription.segments,
            transcription.structured_result, transcription.provider, transcription.provider_version,
            transcription.attempt_count, transcription.result_attempt_number,
            transcription.last_failure_code, transcription.last_failure_message,
            transcription.requested_at, transcription.processed_at, transcription.updated_at
       FROM lesson_audio_recordings recording
       LEFT JOIN lesson_transcriptions transcription ON transcription.recording_id = recording.id
      WHERE recording.lesson_id=$1 AND recording.instructor_id=$2`,
    [lessonId, instructorId]
  );
  const row = rows[0] || null;
  const pauseResult = row ? await pool.query(
    'SELECT paused_at, resumed_at FROM lesson_audio_recording_pauses WHERE recording_id=$1 ORDER BY paused_at ASC',
    [row.recording_id]
  ) : { rows: [] };
  return {
    lesson: { id: lesson.id, sectionId: lesson.section_id, title: lesson.title, topic: lesson.topic, status: lesson.status },
    recording: safeRecording(row, pauseResult.rows),
    transcription: safeTranscription(row),
  };
}

async function recoverStaleAttempts(timeoutMs) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `UPDATE lesson_transcription_attempts
          SET status='PENDING', next_attempt_at=NOW(), worker_id=NULL, locked_at=NULL,
              failure_code='WORKER_INTERRUPTED', failure_message='Transcription worker was interrupted.'
        WHERE status='PROCESSING' AND locked_at < NOW() - ($1::bigint * INTERVAL '1 millisecond')
        RETURNING transcription_id`, [timeoutMs]
    );
    if (rows.length) await client.query(
      `UPDATE lesson_transcriptions SET status='PENDING', updated_at=NOW()
        WHERE id=ANY($1::uuid[]) AND status='PROCESSING'`, [rows.map(row => row.transcription_id)]
    );
    await client.query('COMMIT');
    return rows.length;
  } catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
}

async function claimNextAttempt(workerId) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `SELECT id FROM lesson_transcription_attempts
        WHERE status='PENDING' AND next_attempt_at <= NOW()
        ORDER BY next_attempt_at, created_at FOR UPDATE SKIP LOCKED LIMIT 1`
    );
    if (!rows.length) { await client.query('COMMIT'); return null; }
    const result = await client.query(
      `UPDATE lesson_transcription_attempts SET status='PROCESSING', worker_id=$2,
              locked_at=NOW(), started_at=COALESCE(started_at,NOW()) WHERE id=$1 RETURNING *`,
      [rows[0].id, workerId]
    );
    await client.query(`UPDATE lesson_transcriptions SET status='PROCESSING', updated_at=NOW() WHERE id=$1`, [result.rows[0].transcription_id]);
    await client.query('COMMIT');
    return result.rows[0];
  } catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
}

async function getAttemptSource(attemptId) {
  const { rows } = await pool.query(
    `SELECT attempt.*, transcription.recording_id, transcription.lesson_id, transcription.section_id,
            transcription.instructor_id, recording.storage_key, recording.mime_type, recording.file_size,
            recording.duration_ms, recording.started_at AS recording_started_at,
            recording.completed_at AS recording_completed_at, lesson.started_at AS lesson_started_at,
            lesson.status AS lesson_status
       FROM lesson_transcription_attempts attempt
       JOIN lesson_transcriptions transcription ON transcription.id=attempt.transcription_id
       JOIN lesson_audio_recordings recording ON recording.id=transcription.recording_id
       JOIN lesson_sessions lesson ON lesson.id=transcription.lesson_id
      WHERE attempt.id=$1 AND recording.lesson_id=transcription.lesson_id
        AND recording.section_id=transcription.section_id AND recording.instructor_id=transcription.instructor_id
        AND lesson.instructor_id=transcription.instructor_id`, [attemptId]
  );
  if (!rows.length) { const error = new Error('Transcription ownership metadata does not match.'); error.code='OWNERSHIP_MISMATCH'; throw error; }
  if (rows[0].lesson_status !== 'COMPLETED') { const error = new Error('Lesson must be completed before transcription.'); error.code='OWNERSHIP_MISMATCH'; throw error; }
  const pauses = await pool.query(
    'SELECT paused_at, resumed_at FROM lesson_audio_recording_pauses WHERE recording_id=$1 ORDER BY paused_at ASC',
    [rows[0].recording_id]
  );
  return { ...rows[0], pauses: pauses.rows.map(row => ({ pausedAt: row.paused_at, resumedAt: row.resumed_at })) };
}

async function completeAttempt(attempt, result, source) {
  const mapper = createTimelineMapper({
    recordingStartedAt: source.recording_started_at,
    recordingCompletedAt: source.recording_completed_at,
    lessonStartedAt: source.lesson_started_at,
    durationMs: Number(source.duration_ms),
    pauses: source.pauses,
  });
  const segments = result.normalized.segments.map(segment => mapper.mapSegment(segment));
  const normalized = { ...result.normalized, segments };
  const structuredResult = {
    schemaVersion: 1,
    recordingId: source.recording_id,
    lessonId: source.lesson_id,
    sectionId: source.section_id,
    instructorId: source.instructor_id,
    source: { sha256: source.sha256, mimeType: source.mime_type, durationMs: Number(source.duration_ms) },
    timeline: mapper.metadata,
    provider: TRANSCRIPTION_PROVIDER,
    providerVersion: result.providerVersion,
    ...normalized,
  };
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const current = await client.query('SELECT status FROM lesson_transcription_attempts WHERE id=$1 FOR UPDATE', [attempt.id]);
    if (current.rows[0]?.status !== 'PROCESSING') throw new Error('Transcription attempt is no longer processing.');
    await client.query(
      `UPDATE lesson_transcription_attempts SET status='SUCCEEDED', provider_version=$2,
              normalized_result=$3, sanitized_provider_output=$4, completed_at=NOW() WHERE id=$1`,
      [attempt.id, result.providerVersion, JSON.stringify(normalized), JSON.stringify(result.sanitizedOutput)]
    );
    await client.query(
      `UPDATE lesson_transcriptions SET status='REVIEW_REQUIRED', language=$2, transcript_text=$3,
              segments=$4, structured_result=$5, provider=$6, provider_version=$7,
              source_sha256=$8, source_mime_type=$9, source_duration_ms=$10,
              timing_mapping_version=$11, result_attempt_number=$12,
              last_failure_code=NULL, last_failure_message=NULL, processed_at=NOW(), updated_at=NOW()
        WHERE id=$1`,
      [attempt.transcription_id, normalized.language, normalized.transcriptText, JSON.stringify(segments),
       JSON.stringify(structuredResult), TRANSCRIPTION_PROVIDER, result.providerVersion, source.sha256,
       source.mime_type, Number(source.duration_ms), TIMING_MAPPING_VERSION, attempt.attempt_number]
    );
    await client.query('COMMIT');
  } catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
}

async function failAttempt(attempt, mappedError) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const current = await client.query('SELECT status FROM lesson_transcription_attempts WHERE id=$1 FOR UPDATE', [attempt.id]);
    if (current.rows[0]?.status !== 'PROCESSING') { await client.query('COMMIT'); return; }
    const chain = await client.query(
      `SELECT COUNT(*)::int AS count FROM lesson_transcription_attempts WHERE transcription_id=$1
        AND created_at >= (SELECT MAX(created_at) FROM lesson_transcription_attempts
          WHERE transcription_id=$1 AND request_kind IN ('INITIAL','REPROCESS'))`, [attempt.transcription_id]
    );
    const requestAttemptCount = chain.rows[0].count;
    await client.query(
      `UPDATE lesson_transcription_attempts SET status='FAILED', failure_code=$2,
              failure_message=$3, completed_at=NOW() WHERE id=$1`,
      [attempt.id, mappedError.code, mappedError.message]
    );
    if (mappedError.retryable && requestAttemptCount < TRANSCRIPTION_MAX_ATTEMPTS) {
      const nextAttempt = attempt.attempt_number + 1;
      const delaySeconds = mappedError.code === 'PROVIDER_RATE_LIMITED'
        ? Math.ceil(GEMINI_SHARED_RATE_LIMIT_BACKOFF_MS / 1000) : requestAttemptCount === 1 ? 10 : 30;
      await client.query(
        `INSERT INTO lesson_transcription_attempts
          (transcription_id, attempt_number, request_kind, status, provider, provider_version, next_attempt_at)
         VALUES ($1,$2,'AUTO_RETRY','PENDING',$3,$4,NOW()+($5::int * INTERVAL '1 second'))`,
        [attempt.transcription_id, nextAttempt, TRANSCRIPTION_PROVIDER, GEMINI_TRANSCRIPTION_MODEL, delaySeconds]
      );
      await client.query(
        `UPDATE lesson_transcriptions SET status='PENDING', attempt_count=$2,
                last_failure_code=$3, last_failure_message=$4, updated_at=NOW() WHERE id=$1`,
        [attempt.transcription_id, nextAttempt, mappedError.code, mappedError.message]
      );
    } else {
      await client.query(
        `UPDATE lesson_transcriptions SET status='FAILED', last_failure_code=$2,
                last_failure_message=$3, updated_at=NOW() WHERE id=$1`,
        [attempt.transcription_id, mappedError.code, mappedError.message]
      );
    }
    await client.query('COMMIT');
  } catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
}

module.exports = {
  queueLessonTranscription,
  getLessonTranscription,
  recoverStaleAttempts,
  claimNextAttempt,
  getAttemptSource,
  completeAttempt,
  failAttempt,
};
