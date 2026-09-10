const pool     = require('../db/pool');
const AppError = require('../utils/AppError');
const captureService = require('./capture.service');
const audioRecordingService = require('./audio-recording.service');

// Persisted workflow facts for both list actions and refresh/direct-route fallbacks.
const WORKFLOW_COLUMNS = `
  (SELECT jsonb_build_object('id',v.id,'status',v.status,'versionNumber',v.version_number)
   FROM lesson_context_versions v WHERE v.lesson_id=l.id
   ORDER BY CASE v.status WHEN 'DRAFT' THEN 0 WHEN 'APPROVED' THEN 1 ELSE 2 END,v.version_number DESC LIMIT 1) context_state,
  (SELECT status FROM lesson_recognitions WHERE lesson_id=l.id) recognition_status,
  (SELECT status FROM lesson_transcriptions WHERE lesson_id=l.id) transcription_status,
  EXISTS(SELECT 1 FROM generated_lesson_materials WHERE lesson_id=l.id AND removed=FALSE) has_generated_materials,
  EXISTS(SELECT 1 FROM generated_lesson_materials WHERE lesson_id=l.id AND published_at IS NOT NULL) has_published_materials,
  EXISTS(SELECT 1 FROM lesson_materials WHERE lesson_id=l.id AND status IN ('UPLOADED','PENDING','PROCESSING')) uploads_processing,
  EXISTS(SELECT 1 FROM lesson_materials WHERE lesson_id=l.id AND status IN ('REVIEW_REQUIRED','APPROVED')) uploads_ready,
  EXISTS(SELECT 1 FROM lesson_materials WHERE lesson_id=l.id) has_uploads`;

// ─── Helpers ───────────────────────────────────────────────────────────────

function safeLesson(row, pauseEvents = []) {
  // Compute total paused milliseconds from closed pause events
  const totalPausedMs = pauseEvents.reduce((sum, e) => {
    if (e.paused_at && e.resumed_at) {
      return sum + (new Date(e.resumed_at) - new Date(e.paused_at));
    }
    // Open pause event (lesson currently paused): count up to now
    if (e.paused_at && !e.resumed_at) {
      return sum + (Date.now() - new Date(e.paused_at));
    }
    return sum;
  }, 0);

  return {
    id:              row.id,
    sectionId:       row.section_id,
    instructorId:    row.instructor_id,
    title:           row.title,
    topic:           row.topic || null,
    status:          row.status,
    startedAt:       row.started_at  || null,
    endedAt:         row.ended_at    || null,
    createdAt:       row.created_at,
    totalPausedMs,                         // ms — frontend computes display
    workflow: {
      context: row.context_state || null,
      recognitionStatus: row.recognition_status || null,
      transcriptionStatus: row.transcription_status || null,
      hasGeneratedMaterials: Boolean(row.has_generated_materials),
      hasPublishedMaterials: Boolean(row.has_published_materials),
      uploadsProcessing: Boolean(row.uploads_processing),
      uploadsReady: Boolean(row.uploads_ready),
      hasUploads: Boolean(row.has_uploads),
    },
    pauseEvents:     pauseEvents.map(e => ({
      id:         e.id,
      pausedAt:   e.paused_at,
      resumedAt:  e.resumed_at || null,
    })),
    // joined fields
    sectionName:  row.section_name  || undefined,
    subjectCode:  row.subject_code  || undefined,
    subjectName:  row.subject_name  || undefined,
  };
}

async function fetchPauseEvents(lessonId) {
  const { rows } = await pool.query(
    'SELECT * FROM lesson_pause_events WHERE lesson_id = $1 ORDER BY paused_at ASC',
    [lessonId]
  );
  return rows;
}

// Ownership + existence guard
async function assertOwnership(lessonId, instructorId) {
  const { rows } = await pool.query(
    'SELECT * FROM lesson_sessions WHERE id = $1',
    [lessonId]
  );
  if (rows.length === 0) throw new AppError('Lesson not found.', 404);
  if (rows[0].instructor_id !== instructorId) {
    throw new AppError('Access denied. You do not own this lesson.', 403);
  }
  return rows[0];
}

// ─── Create lesson ────────────────────────────────────────────────────────

async function createLesson({ sectionId, instructorId, title, topic }) {
  if (!title || !title.trim()) throw new AppError('Lesson title is required.', 400);

  const { rows: own } = await pool.query(
    'SELECT id FROM sections WHERE id = $1 AND instructor_id = $2',
    [sectionId, instructorId]
  );
  if (own.length === 0) throw new AppError('Section not found or access denied.', 404);

  // Block creation if section already has an ACTIVE or PAUSED lesson
  const { rows: current } = await pool.query(
    `SELECT id, title, status FROM lesson_sessions
     WHERE section_id = $1 AND status IN ('ACTIVE', 'PAUSED')
     LIMIT 1`,
    [sectionId]
  );
  if (current.length > 0) {
    throw new AppError(
      'A lesson is already in progress for this section. End the current lesson before creating another.',
      409
    );
  }

  const { rows } = await pool.query(
    `INSERT INTO lesson_sessions (section_id, instructor_id, title, topic, status)
     VALUES ($1, $2, $3, $4, 'CREATED') RETURNING *`,
    [sectionId, instructorId, title.trim(), topic ? topic.trim() : null]
  );
  return safeLesson(rows[0], []);
}

// ─── List lessons for a section ───────────────────────────────────────────

async function getLessons(sectionId, instructorId) {
  const { rows: own } = await pool.query(
    'SELECT id FROM sections WHERE id = $1 AND instructor_id = $2',
    [sectionId, instructorId]
  );
  if (own.length === 0) throw new AppError('Section not found or access denied.', 404);

  const { rows } = await pool.query(
    `SELECT l.*, s.section_name, sub.code AS subject_code, sub.name AS subject_name, ${WORKFLOW_COLUMNS}
     FROM lesson_sessions l
     JOIN sections s ON s.id = l.section_id
     JOIN subjects sub ON sub.id = s.subject_id
     WHERE l.section_id = $1
     ORDER BY l.created_at DESC`,
    [sectionId]
  );

  // Fetch pause events for all lessons in one query
  const lessonIds = rows.map(r => r.id);
  let pauseMap = {};
  if (lessonIds.length > 0) {
    const { rows: allPauses } = await pool.query(
      'SELECT * FROM lesson_pause_events WHERE lesson_id = ANY($1) ORDER BY paused_at ASC',
      [lessonIds]
    );
    for (const p of allPauses) {
      if (!pauseMap[p.lesson_id]) pauseMap[p.lesson_id] = [];
      pauseMap[p.lesson_id].push(p);
    }
  }

  return rows.map(r => safeLesson(r, pauseMap[r.id] || []));
}

// ─── Get one lesson (with pause events) ──────────────────────────────────

async function getLessonById(lessonId, instructorId) {
  await assertOwnership(lessonId, instructorId);

  const { rows } = await pool.query(
    `SELECT l.*, s.section_name, sub.code AS subject_code, sub.name AS subject_name, ${WORKFLOW_COLUMNS}
     FROM lesson_sessions l
     JOIN sections s ON s.id = l.section_id
     JOIN subjects sub ON sub.id = s.subject_id
     WHERE l.id = $1`,
    [lessonId]
  );
  const pauses = await fetchPauseEvents(lessonId);
  return safeLesson(rows[0], pauses);
}

// Update lesson details without changing its lifecycle state
async function updateLesson(lessonId, instructorId, { title, topic }) {
  await assertOwnership(lessonId, instructorId);

  const cleanTitle = typeof title === 'string' ? title.trim() : '';
  const cleanTopic = typeof topic === 'string' ? topic.trim() : '';
  if (!cleanTitle) throw new AppError('Lesson title is required.', 400);
  if (cleanTitle.length > 200) throw new AppError('Lesson title must be 200 characters or fewer.', 400);
  if (cleanTopic.length > 500) throw new AppError('Lesson topic must be 500 characters or fewer.', 400);

  const { rows } = await pool.query(
    `UPDATE lesson_sessions
     SET title = $1, topic = $2
     WHERE id = $3 AND instructor_id = $4
     RETURNING *`,
    [cleanTitle, cleanTopic || null, lessonId, instructorId]
  );
  const pauses = await fetchPauseEvents(lessonId);
  return safeLesson(rows[0], pauses);
}

// Delete an owned lesson only when it is not currently running
async function deleteLesson(lessonId, instructorId) {
  const lesson = await assertOwnership(lessonId, instructorId);
  if (['ACTIVE', 'PAUSED'].includes(lesson.status)) {
    throw new AppError('End this lesson before deleting it.', 409);
  }

  await Promise.all([
    captureService.deleteAssetsForLesson(lessonId, instructorId),
    audioRecordingService.deleteAssetsForLesson(lessonId, instructorId),
  ]);
  await pool.query(
    'DELETE FROM lesson_sessions WHERE id = $1 AND instructor_id = $2',
    [lessonId, instructorId]
  );
  return { message: 'Lesson deleted successfully.' };
}

// ─── Start lesson (CREATED → ACTIVE) ─────────────────────────────────────

async function startLesson(lessonId, instructorId) {
  const lesson = await assertOwnership(lessonId, instructorId);

  if (lesson.status !== 'CREATED') {
    const msgs = {
      ACTIVE:    'This lesson is already active.',
      PAUSED:    'This lesson is paused. Use Resume to continue.',
      COMPLETED: 'A completed lesson cannot be restarted.',
    };
    throw new AppError(msgs[lesson.status] || 'Invalid transition.', 409);
  }

  // DB partial unique index lesson_sessions_one_current_per_section
  // catches concurrent ACTIVE/PAUSED lessons at the DB level
  const { rows } = await pool.query(
    `UPDATE lesson_sessions SET status = 'ACTIVE', started_at = NOW()
     WHERE id = $1 AND instructor_id = $2 AND status = 'CREATED' RETURNING *`,
    [lessonId, instructorId]
  );
  if (!rows.length) throw new AppError('This lesson is no longer ready to start. Refresh the session and try again.', 409);
  return safeLesson(rows[0], []);
}

// ─── Pause lesson (ACTIVE → PAUSED) ──────────────────────────────────────

async function pauseLesson(lessonId, instructorId) {
  const lesson = await assertOwnership(lessonId, instructorId);

  if (lesson.status !== 'ACTIVE') {
    throw new AppError('This lesson cannot be paused in its current state.', 409);
  }

  // Atomic: update status + create open pause event in a transaction
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `UPDATE lesson_sessions SET status = 'PAUSED' WHERE id = $1`,
      [lessonId]
    );
    await client.query(
      `INSERT INTO lesson_pause_events (lesson_id, paused_at) VALUES ($1, NOW())`,
      [lessonId]
    );
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  const { rows } = await pool.query('SELECT * FROM lesson_sessions WHERE id = $1', [lessonId]);
  const pauses = await fetchPauseEvents(lessonId);
  return safeLesson(rows[0], pauses);
}

// ─── Resume lesson (PAUSED → ACTIVE) ─────────────────────────────────────

async function resumeLesson(lessonId, instructorId) {
  const lesson = await assertOwnership(lessonId, instructorId);

  if (lesson.status !== 'PAUSED') {
    throw new AppError('This lesson cannot be resumed in its current state.', 409);
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // Close the open pause event
    await client.query(
      `UPDATE lesson_pause_events
       SET resumed_at = NOW()
       WHERE lesson_id = $1 AND resumed_at IS NULL`,
      [lessonId]
    );
    await client.query(
      `UPDATE lesson_sessions SET status = 'ACTIVE' WHERE id = $1`,
      [lessonId]
    );
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  const { rows } = await pool.query('SELECT * FROM lesson_sessions WHERE id = $1', [lessonId]);
  const pauses = await fetchPauseEvents(lessonId);
  return safeLesson(rows[0], pauses);
}

// ─── End lesson (ACTIVE|PAUSED → COMPLETED) ──────────────────────────────

async function endLesson(lessonId, instructorId) {
  const lesson = await assertOwnership(lessonId, instructorId);

  if (!['ACTIVE', 'PAUSED'].includes(lesson.status)) {
    throw new AppError('This lesson cannot be ended in its current state.', 409);
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // If paused, close the open pause event first
    if (lesson.status === 'PAUSED') {
      await client.query(
        `UPDATE lesson_pause_events
         SET resumed_at = NOW()
         WHERE lesson_id = $1 AND resumed_at IS NULL`,
        [lessonId]
      );
    }
    await client.query(
      `UPDATE lesson_sessions SET status = 'COMPLETED', ended_at = NOW() WHERE id = $1`,
      [lessonId]
    );
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  const { rows } = await pool.query('SELECT * FROM lesson_sessions WHERE id = $1', [lessonId]);
  const pauses = await fetchPauseEvents(lessonId);
  return safeLesson(rows[0], pauses);
}

module.exports = {
  createLesson,
  getLessons,
  getLessonById,
  updateLesson,
  deleteLesson,
  startLesson,
  pauseLesson,
  resumeLesson,
  endLesson,
};
