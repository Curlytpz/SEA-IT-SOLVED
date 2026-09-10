const pool = require('../db/pool');
const materialService = require('./lesson-material.service');
const recognitionService = require('./lesson-recognition.service');
const transcriptionService = require('./transcription.service');
const contextService = require('./lesson-context.service');
const AppError = require('../utils/AppError');

async function processCompleteLesson(lessonId, instructorId) {
  const { rows } = await pool.query(
    `SELECT lesson.*,
      (SELECT COUNT(*)::int FROM lesson_captures WHERE lesson_id=lesson.id AND instructor_id=$2) AS capture_count,
      EXISTS(SELECT 1 FROM lesson_audio_recordings WHERE lesson_id=lesson.id AND instructor_id=$2) AS has_audio
     FROM lesson_sessions lesson WHERE lesson.id=$1`, [lessonId, instructorId]
  );
  if (!rows.length || rows[0].instructor_id !== instructorId) throw new AppError('Lesson not found or access denied.', 404);
  if (rows[0].status !== 'COMPLETED') throw new AppError('Complete lesson processing is available after the lesson has ended.', 409);
  const lesson = rows[0];
  const queued = { whiteboard: false, transcription: false, materials: 0 };
  if (lesson.capture_count > 0) {
    const existing = await pool.query('SELECT status FROM lesson_recognitions WHERE lesson_id=$1', [lessonId]);
    const result = await recognitionService.queueLesson(lessonId, instructorId);
    queued.whiteboard = result.queued;
    if (existing.rows[0] && ['REVIEW_REQUIRED', 'APPROVED'].includes(existing.rows[0].status)) queued.whiteboard = true;
  }
  if (lesson.has_audio) {
    const existing = await pool.query('SELECT status FROM lesson_transcriptions WHERE lesson_id=$1', [lessonId]);
    const result = await transcriptionService.queueLessonTranscription(lessonId, instructorId, {
      reprocess: Boolean(existing.rows[0] && !['PENDING', 'PROCESSING'].includes(existing.rows[0].status)),
    });
    queued.transcription = result.queued;
  }
  const failed = await pool.query(
    `SELECT id FROM lesson_materials WHERE lesson_id=$1 AND instructor_id=$2 AND status='FAILED'`, [lessonId, instructorId]
  );
  for (const material of failed.rows) {
    const result = await materialService.reprocess(material.id, instructorId);
    if (result.queued) queued.materials += 1;
  }
  const context = await contextService.tryBuildDraft(lessonId, instructorId);
  return { queued, context: context?.context || null };
}

module.exports = { processCompleteLesson };
