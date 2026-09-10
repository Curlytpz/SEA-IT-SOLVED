const crypto = require('crypto');
const pool = require('../db/pool');
const { audioStorage } = require('../storage');
const AppError = require('../utils/AppError');
const { validateAudioFile } = require('../utils/audioFile');

function safeRecording(row, pauses = []) {
  return {
    id: row.id,
    lessonId: row.lesson_id,
    sectionId: row.section_id,
    instructorId: row.instructor_id,
    sourceKey: row.source_key,
    hardwareMode: row.hardware_mode,
    storageProvider: row.storage_provider,
    mimeType: row.mime_type,
    fileSize: Number(row.file_size),
    durationMs: Number(row.duration_ms),
    startedAt: row.started_at,
    completedAt: row.completed_at,
    recordedAt: row.recorded_at,
    createdAt: row.created_at,
    audioUrl: `/api/audio-recordings/${row.id}/audio`,
    pauses: pauses.map(item => ({ id:item.id, pausedAt:item.paused_at, resumedAt:item.resumed_at })),
  };
}

async function getOwnedLesson(lessonId, instructorId) {
  const { rows } = await pool.query(
    'SELECT id, section_id, instructor_id, status FROM lesson_sessions WHERE id = $1',
    [lessonId]
  );
  if (!rows.length) throw new AppError('Lesson not found.', 404);
  if (rows[0].instructor_id !== instructorId) throw new AppError('Access denied. You do not own this lesson.', 403);
  return rows[0];
}

function parseTimestamp(value, label) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) throw new AppError(`${label} is invalid.`, 400);
  return date;
}

function parsePauses(value, startedAt, completedAt) {
  let input = [];
  try { input = value ? JSON.parse(value) : []; }
  catch { throw new AppError('Recording pause metadata is invalid.', 400); }
  if (!Array.isArray(input) || input.length > 1000) throw new AppError('Recording pause metadata is invalid.', 400);
  let previous = startedAt.getTime();
  return input.map(item => {
    const pausedAt = parseTimestamp(item.pausedAt, 'Recording pause time');
    const resumedAt = parseTimestamp(item.resumedAt, 'Recording resume time');
    if (pausedAt < startedAt || resumedAt < pausedAt || resumedAt > completedAt || pausedAt.getTime() < previous) {
      throw new AppError('Recording pause periods must be ordered and within the recording.', 400);
    }
    previous = resumedAt.getTime();
    return { pausedAt, resumedAt };
  });
}

async function createRecording(lessonId, instructorId, file, input) {
  const lesson = await getOwnedLesson(lessonId, instructorId);
  if (!['ACTIVE', 'PAUSED'].includes(lesson.status)) {
    throw new AppError('Audio can only be finalized while the lesson is active or paused.', 409);
  }
  const hardwareMode = input.hardwareMode;
  const sourceKey = typeof input.sourceKey === 'string' ? input.sourceKey.trim().slice(0, 255) : '';
  if (!['SIMULATED', 'BROWSER'].includes(hardwareMode) || !sourceKey) {
    throw new AppError('Microphone source metadata is invalid.', 400);
  }
  const durationMs = Number(input.durationMs);
  if (!Number.isInteger(durationMs) || durationMs < 0 || durationMs > 24 * 60 * 60 * 1000) {
    throw new AppError('Recording duration is invalid.', 400);
  }
  const startedAt = parseTimestamp(input.startedAt, 'Recording start time');
  const completedAt = parseTimestamp(input.completedAt, 'Recording completion time');
  if (completedAt < startedAt) throw new AppError('Recording completion time is invalid.', 400);
  const pauses = parsePauses(input.pauses, startedAt, completedAt);
  const { mime, extension } = await validateAudioFile(file);
  const storageKey = `${instructorId}/${lessonId}/${crypto.randomUUID()}.${extension}`;
  try { await audioStorage.putFile(storageKey, file.path); }
  catch { throw new AppError('Unable to store the audio recording. Please try again.', 500); }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `INSERT INTO lesson_audio_recordings
        (lesson_id, section_id, instructor_id, source_key, hardware_mode, storage_provider,
         storage_key, mime_type, file_size, duration_ms, started_at, completed_at, recorded_at)
       VALUES ($1,$2,$3,$4,$5,'LOCAL',$6,$7,$8,$9,$10,$11,$11)
       RETURNING *`,
      [lesson.id, lesson.section_id, instructorId, sourceKey, hardwareMode, storageKey,
       mime, file.size, durationMs, startedAt, completedAt]
    );
    for (const pause of pauses) {
      await client.query(
        `INSERT INTO lesson_audio_recording_pauses (recording_id, paused_at, resumed_at)
         VALUES ($1,$2,$3)`,
        [rows[0].id, pause.pausedAt, pause.resumedAt]
      );
    }
    await client.query('COMMIT');
    const pauseRows = await getPauseRows(rows[0].id);
    return safeRecording(rows[0], pauseRows);
  } catch (error) {
    await client.query('ROLLBACK');
    await audioStorage.delete(storageKey).catch(()=>{});
    if (error.code === '23505') throw new AppError('This lesson already has a saved audio recording.', 409);
    throw error;
  } finally {
    client.release();
  }
}

async function getPauseRows(recordingId) {
  const { rows } = await pool.query(
    'SELECT * FROM lesson_audio_recording_pauses WHERE recording_id = $1 ORDER BY paused_at ASC',
    [recordingId]
  );
  return rows;
}

async function getLessonRecording(lessonId, instructorId) {
  await getOwnedLesson(lessonId, instructorId);
  const { rows } = await pool.query(
    'SELECT * FROM lesson_audio_recordings WHERE lesson_id = $1 AND instructor_id = $2',
    [lessonId, instructorId]
  );
  if (!rows.length) return null;
  return safeRecording(rows[0], await getPauseRows(rows[0].id));
}

async function getSectionRecordings(sectionId, instructorId) {
  const { rows: sections } = await pool.query(
    'SELECT id FROM sections WHERE id = $1 AND instructor_id = $2', [sectionId, instructorId]
  );
  if (!sections.length) throw new AppError('Section not found or access denied.', 404);
  const { rows } = await pool.query(
    'SELECT * FROM lesson_audio_recordings WHERE section_id = $1 AND instructor_id = $2 ORDER BY recorded_at DESC',
    [sectionId, instructorId]
  );
  return Promise.all(rows.map(async row => safeRecording(row, await getPauseRows(row.id))));
}

async function getRecordingFile(recordingId, instructorId) {
  const { rows } = await pool.query(
    'SELECT * FROM lesson_audio_recordings WHERE id = $1 AND instructor_id = $2',
    [recordingId, instructorId]
  );
  if (!rows.length) throw new AppError('Audio recording not found.', 404);
  try { return { ...(await audioStorage.open(rows[0].storage_key)), mime:rows[0].mime_type }; }
  catch (error) {
    if (error.code === 'ENOENT') throw new AppError('Audio recording file is unavailable.', 404);
    throw new AppError('Unable to load the audio recording. Please try again.', 500);
  }
}

async function deleteRecording(recordingId, instructorId) {
  const { rows } = await pool.query(
    'SELECT * FROM lesson_audio_recordings WHERE id = $1 AND instructor_id = $2',
    [recordingId, instructorId]
  );
  if (!rows.length) throw new AppError('Audio recording not found.', 404);
  try { await audioStorage.delete(rows[0].storage_key); }
  catch { throw new AppError('Unable to delete the audio recording file. Please try again.', 500); }
  await pool.query('DELETE FROM lesson_audio_recordings WHERE id = $1 AND instructor_id = $2', [recordingId, instructorId]);
}

async function deleteAssetsForLesson(lessonId, instructorId) {
  const { rows } = await pool.query(
    'SELECT storage_key FROM lesson_audio_recordings WHERE lesson_id = $1 AND instructor_id = $2',
    [lessonId, instructorId]
  );
  try { await Promise.all(rows.map(row => audioStorage.delete(row.storage_key))); }
  catch { throw new AppError('Unable to remove lesson audio files. Please try again.', 500); }
}

module.exports = {
  createRecording,
  getLessonRecording,
  getSectionRecordings,
  getRecordingFile,
  deleteRecording,
  deleteAssetsForLesson,
};
