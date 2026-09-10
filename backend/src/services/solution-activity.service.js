const crypto = require('node:crypto');
const path = require('node:path');
const pool = require('../db/pool');
const AppError = require('../utils/AppError');
const { validateImageFile } = require('../utils/imageFile');
const { solutionSubmissionStorage } = require('../storage');
const contextService = require('./lesson-context.service');
const { GEMINI_REASONING_MODEL } = require('../config/env');
const { recognizeImage, defaultReview, approvedExcerpt, reviewSchema } = require('./solution-review.service');

const clean = (value, max) => String(value ?? '').normalize('NFC').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim().slice(0, max);
const numeric = value => value == null ? null : Number(value);

function activityInput(body = {}) {
  const title = clean(body.title, 200), problemText = clean(body.problemText, 20000);
  const instructions = clean(body.instructions, 10000), rubricText = clean(body.rubricText, 20000) || null;
  const maxPoints = Number(body.maxPoints);
  if (!title) throw new AppError('Activity title is required.', 400);
  if (!problemText) throw new AppError('Problem or question is required.', 400);
  if (!Number.isFinite(maxPoints) || maxPoints <= 0 || maxPoints > 10000) throw new AppError('Maximum points must be greater than 0.', 400);
  const dueAt = body.dueAt ? new Date(body.dueAt) : null;
  if (dueAt && Number.isNaN(dueAt.getTime())) throw new AppError('Due date is invalid.', 400);
  return { title, problemText, instructions, rubricText, maxPoints, dueAt };
}

function safeActivity(row, { student = false } = {}) {
  const activity = {
    id: row.id, lessonId: row.lesson_id, title: row.title, problemText: row.problem_text,
    instructions: row.instructions || '', maxPoints: numeric(row.max_points), status: row.status,
    dueAt: row.due_at, publishedAt: row.published_at, closedAt: row.closed_at,
    submissionCount: Number(row.submission_count || 0), awaitingReviewCount: Number(row.awaiting_review_count || 0),
    gradedCount: Number(row.graded_count || 0), createdAt: row.created_at, updatedAt: row.updated_at,
  };
  if (!student) activity.rubricText = row.rubric_text || '';
  return activity;
}

function safeReview(row) {
  if (!row?.review_id) return null;
  return {
    id: row.review_id, assessment: row.assessment, summary: row.review_summary,
    strengths: row.review_strengths || [], possibleErrors: row.review_possible_errors || [],
    suggestedFeedback: row.review_suggested_feedback || '', confidence: numeric(row.review_confidence),
    createdAt: row.review_created_at,
  };
}

function safeSubmission(row, { student = false } = {}) {
  const hasSubmissionAlias = Object.prototype.hasOwnProperty.call(row || {}, 'submission_id');
  if (!row || (hasSubmissionAlias ? !row.submission_id : !row.id)) return null;
  const id = row.submission_id || row.id;
  const result = {
    id, activityId: row.submission_activity_id || row.activity_id, status: row.submission_status || row.status,
    recognitionStatus: row.recognition_status, submittedAt: row.submitted_at, updatedAt: row.updated_at,
    revision: Number(row.submission_revision || 1), imageUrl: `/api/solution-submissions/${id}/image`,
    finalScore: row.feedback_released_at ? numeric(row.final_score) : null,
    instructorFeedback: row.feedback_released_at ? row.instructor_feedback || '' : '',
    feedbackReleasedAt: row.feedback_released_at || null,
  };
  if (!student) {
    Object.assign(result, {
      student: row.student_id ? { id: row.student_id, name: [row.first_name, row.last_name].filter(Boolean).join(' '), studentNumber: row.student_number } : null,
      originalFilename: row.original_filename, extractedSolutionText: row.extracted_solution_text || '',
      recognizedMath: row.recognized_math || [], recognitionFailure: row.recognition_failure || null,
      aiReview: safeReview(row), finalScore: numeric(row.final_score), instructorFeedback: row.instructor_feedback || '',
    });
  }
  return result;
}

async function ownedLesson(lessonId, instructorId, client = pool) {
  const { rows } = await client.query('SELECT id,section_id,instructor_id FROM lesson_sessions WHERE id=$1 AND instructor_id=$2', [lessonId, instructorId]);
  if (!rows.length) throw new AppError('Lesson not found or access denied.', 404);
  return rows[0];
}

async function ownedActivity(activityId, instructorId, client = pool, lock = false) {
  const { rows } = await client.query(`SELECT activity.* FROM solution_activities activity JOIN lesson_sessions lesson ON lesson.id=activity.lesson_id WHERE activity.id=$1 AND activity.instructor_id=$2 AND lesson.instructor_id=$2${lock ? ' FOR UPDATE OF activity' : ''}`, [activityId, instructorId]);
  if (!rows.length) throw new AppError('Solution activity not found or access denied.', 404);
  return rows[0];
}

async function studentActivity(activityId, studentId, client = pool, { requireOpen = false } = {}) {
  const { rows } = await client.query(`SELECT activity.* FROM solution_activities activity
    JOIN lesson_sessions lesson ON lesson.id=activity.lesson_id
    JOIN enrollments enrollment ON enrollment.section_id=activity.section_id
    JOIN users instructor ON instructor.id=activity.instructor_id
    WHERE activity.id=$1 AND enrollment.student_id=$2 AND enrollment.status='APPROVED'
      AND instructor.status='ACTIVE' AND activity.status IN ('PUBLISHED','CLOSED')`, [activityId, studentId]);
  if (!rows.length) throw new AppError('Solution activity is not available.', 404);
  const activity = rows[0];
  if (requireOpen && (activity.status !== 'PUBLISHED' || (activity.due_at && new Date(activity.due_at) < new Date()))) {
    throw new AppError('This solution activity is closed for submissions.', 409);
  }
  return activity;
}

async function listInstructor(lessonId, instructorId) {
  await ownedLesson(lessonId, instructorId);
  const { rows } = await pool.query(`SELECT activity.*,
    COUNT(submission.id)::int submission_count,
    COUNT(submission.id) FILTER (WHERE submission.status<>'GRADED')::int awaiting_review_count,
    COUNT(submission.id) FILTER (WHERE submission.status='GRADED')::int graded_count
    FROM solution_activities activity LEFT JOIN solution_submissions submission ON submission.activity_id=activity.id
    WHERE activity.lesson_id=$1 AND activity.instructor_id=$2 GROUP BY activity.id ORDER BY activity.created_at DESC`, [lessonId, instructorId]);
  return rows.map(row => safeActivity(row));
}

async function createActivity(lessonId, instructorId, body) {
  const lesson = await ownedLesson(lessonId, instructorId);
  const input = activityInput(body);
  const { rows } = await pool.query(`INSERT INTO solution_activities
    (lesson_id,section_id,instructor_id,title,problem_text,instructions,rubric_text,max_points,due_at)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
    [lesson.id, lesson.section_id, instructorId, input.title, input.problemText, input.instructions, input.rubricText, input.maxPoints, input.dueAt]);
  return safeActivity(rows[0]);
}

async function updateActivity(activityId, instructorId, body) {
  const input = activityInput(body);
  const activity = await ownedActivity(activityId, instructorId);
  if (activity.status !== 'DRAFT') throw new AppError('Only draft solution activities can be edited.', 409);
  const { rows } = await pool.query(`UPDATE solution_activities SET title=$3,problem_text=$4,instructions=$5,rubric_text=$6,max_points=$7,due_at=$8,updated_at=NOW()
    WHERE id=$1 AND instructor_id=$2 RETURNING *`, [activityId, instructorId, input.title, input.problemText, input.instructions, input.rubricText, input.maxPoints, input.dueAt]);
  return safeActivity(rows[0]);
}

async function setActivityStatus(activityId, instructorId, action) {
  const activity = await ownedActivity(activityId, instructorId);
  const transitions = { publish: ['DRAFT','PUBLISHED'], close: ['PUBLISHED','CLOSED'], reopen: ['CLOSED','PUBLISHED'] };
  const transition = transitions[action];
  if (!transition || activity.status !== transition[0]) throw new AppError('That activity status change is not available.', 409);
  const { rows } = await pool.query(`UPDATE solution_activities SET status=$3::varchar,
    published_at=CASE WHEN $3::varchar='PUBLISHED' THEN COALESCE(published_at,NOW()) ELSE published_at END,
    closed_at=CASE WHEN $3::varchar='CLOSED' THEN NOW() ELSE NULL END,updated_at=NOW()
    WHERE id=$1 AND instructor_id=$2 RETURNING *`, [activityId, instructorId, transition[1]]);
  return safeActivity(rows[0]);
}

async function deleteActivity(activityId, instructorId) {
  const activity = await ownedActivity(activityId, instructorId);
  if (activity.status !== 'DRAFT') throw new AppError('Only draft solution activities can be deleted.', 409);
  await pool.query('DELETE FROM solution_activities WHERE id=$1 AND instructor_id=$2', [activityId, instructorId]);
}

async function listStudent(lessonId, studentId) {
  const enrolled = await pool.query(`SELECT lesson.id FROM lesson_sessions lesson JOIN enrollments enrollment ON enrollment.section_id=lesson.section_id
    JOIN users instructor ON instructor.id=lesson.instructor_id WHERE lesson.id=$1 AND enrollment.student_id=$2 AND enrollment.status='APPROVED' AND instructor.status='ACTIVE'`, [lessonId, studentId]);
  if (!enrolled.rows.length) throw new AppError('Lesson not found or you are not enrolled in this section.', 404);
  const { rows } = await pool.query(`SELECT activity.*,submission.id submission_id,submission.activity_id submission_activity_id,submission.status submission_status,
    submission.recognition_status,submission.submission_revision,submission.submitted_at,submission.updated_at,
    submission.final_score,submission.instructor_feedback,submission.feedback_released_at
    FROM solution_activities activity LEFT JOIN solution_submissions submission ON submission.activity_id=activity.id AND submission.student_id=$2
    WHERE activity.lesson_id=$1 AND activity.status IN ('PUBLISHED','CLOSED') ORDER BY activity.published_at,activity.created_at`, [lessonId, studentId]);
  return rows.map(row => ({ ...safeActivity(row, { student: true }), submission: safeSubmission(row, { student: true }), acceptingSubmissions: row.status === 'PUBLISHED' && (!row.due_at || new Date(row.due_at) >= new Date()) }));
}

const extensionByMime = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

async function getStudentSubmission(activityId, studentId) {
  await studentActivity(activityId, studentId);
  const { rows } = await pool.query(`SELECT submission.*,submission.id submission_id,submission.status submission_status
    FROM solution_submissions submission WHERE submission.activity_id=$1 AND submission.student_id=$2`, [activityId, studentId]);
  return rows.length ? safeSubmission(rows[0], { student: true }) : null;
}

async function submitSolution(activityId, studentId, file, { recognize = recognizeImage } = {}) {
  const activity = await studentActivity(activityId, studentId, pool, { requireOpen: true });
  const mimeType = validateImageFile(file, 'Solution');
  const storageKey = `${studentId}/${activity.lesson_id}/${activity.id}/${crypto.randomUUID()}.${extensionByMime[mimeType]}`;
  await solutionSubmissionStorage.put(storageKey, file.buffer);
  const client = await pool.connect();
  let previousKey = null, submission;
  try {
    await client.query('BEGIN');
    const existing = await client.query('SELECT * FROM solution_submissions WHERE activity_id=$1 AND student_id=$2 FOR UPDATE', [activityId, studentId]);
    if (existing.rows[0]?.status === 'GRADED') throw new AppError('A graded solution cannot be resubmitted unless the instructor reopens it.', 409);
    previousKey = existing.rows[0]?.storage_key || null;
    const filename = clean(path.basename(file.originalname || 'solution-image'), 255) || 'solution-image';
    const { rows } = await client.query(`INSERT INTO solution_submissions
      (activity_id,lesson_id,section_id,student_id,storage_key,original_filename,mime_type,file_size,recognition_status,status)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,'PROCESSING','PROCESSING')
      ON CONFLICT(activity_id,student_id) DO UPDATE SET storage_key=EXCLUDED.storage_key,original_filename=EXCLUDED.original_filename,
        mime_type=EXCLUDED.mime_type,file_size=EXCLUDED.file_size,extracted_solution_text='',recognized_math='[]'::jsonb,
        recognition_result=NULL,recognition_status='PROCESSING',recognition_failure=NULL,status='PROCESSING',submission_revision=solution_submissions.submission_revision+1,
        final_score=NULL,instructor_feedback=NULL,graded_by=NULL,graded_at=NULL,feedback_released_at=NULL,submitted_at=NOW(),updated_at=NOW()
      RETURNING *`, [activityId, activity.lesson_id, activity.section_id, studentId, storageKey, filename, mimeType, file.size]);
    submission = rows[0];
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    await solutionSubmissionStorage.delete(storageKey).catch(() => {});
    throw error;
  } finally { client.release(); }
  if (previousKey && previousKey !== storageKey) await solutionSubmissionStorage.delete(previousKey).catch(() => {});

  try {
    const normalized = await recognize(file.buffer, mimeType);
    await pool.query(`UPDATE solution_submissions SET extracted_solution_text=$3,recognized_math=$4,recognition_result=$5,
      recognition_status='READY',recognition_failure=NULL,status='READY_FOR_REVIEW',updated_at=NOW()
      WHERE id=$1 AND submission_revision=$2`, [submission.id, submission.submission_revision, normalized.plainText || '', JSON.stringify(normalized.mathExpressions || []), JSON.stringify(normalized)]);
  } catch (_error) {
    await pool.query(`UPDATE solution_submissions SET recognition_status='FAILED',recognition_failure='Recognition could not read this image. The original submission is preserved.',
      status='SUBMITTED',updated_at=NOW() WHERE id=$1 AND submission_revision=$2`, [submission.id, submission.submission_revision]);
  }
  return getStudentSubmission(activityId, studentId);
}

const submissionDetailQuery = `SELECT submission.*,submission.id submission_id,submission.status submission_status,
  student.first_name,student.last_name,student.student_number,activity.title activity_title,activity.problem_text,activity.instructions,
  activity.rubric_text,activity.max_points,activity.status activity_status,activity.due_at,
  review.id review_id,review.assessment,review.summary review_summary,review.strengths review_strengths,
  review.possible_errors review_possible_errors,review.suggested_feedback review_suggested_feedback,
  review.confidence review_confidence,review.created_at review_created_at
  FROM solution_submissions submission JOIN solution_activities activity ON activity.id=submission.activity_id
  JOIN users student ON student.id=submission.student_id
  LEFT JOIN LATERAL (SELECT * FROM solution_submission_ai_reviews candidate
    WHERE candidate.submission_id=submission.id AND candidate.submission_revision=submission.submission_revision
    ORDER BY candidate.created_at DESC LIMIT 1) review ON TRUE`;

async function instructorSubmission(submissionId, instructorId, client = pool, lock = false) {
  const { rows } = await client.query(`${submissionDetailQuery} WHERE submission.id=$1 AND activity.instructor_id=$2${lock ? ' FOR UPDATE OF submission' : ''}`, [submissionId, instructorId]);
  if (!rows.length) throw new AppError('Solution submission not found or access denied.', 404);
  return rows[0];
}

async function listSubmissions(activityId, instructorId) {
  await ownedActivity(activityId, instructorId);
  const { rows } = await pool.query(`${submissionDetailQuery} WHERE submission.activity_id=$1 AND activity.instructor_id=$2 ORDER BY submission.submitted_at DESC`, [activityId, instructorId]);
  return rows.map(row => safeSubmission(row));
}

async function retryRecognition(submissionId, instructorId, { recognize = recognizeImage } = {}) {
  const row = await instructorSubmission(submissionId, instructorId);
  if (row.status === 'GRADED') throw new AppError('Recognition cannot be changed after grading.', 409);
  const opened = await solutionSubmissionStorage.open(row.storage_key);
  const chunks = []; for await (const chunk of opened.stream) chunks.push(chunk);
  const buffer = Buffer.concat(chunks);
  await pool.query(`UPDATE solution_submissions SET recognition_status='PROCESSING',recognition_failure=NULL,status='PROCESSING',updated_at=NOW() WHERE id=$1`, [submissionId]);
  try {
    const normalized = await recognize(buffer, row.mime_type);
    await pool.query(`UPDATE solution_submissions SET extracted_solution_text=$2,recognized_math=$3,recognition_result=$4,
      recognition_status='READY',status='READY_FOR_REVIEW',updated_at=NOW() WHERE id=$1`,
      [submissionId, normalized.plainText || '', JSON.stringify(normalized.mathExpressions || []), JSON.stringify(normalized)]);
  } catch (error) {
    await pool.query(`UPDATE solution_submissions SET recognition_status='FAILED',recognition_failure='Recognition could not read this image. The original submission is preserved.',status='SUBMITTED',updated_at=NOW() WHERE id=$1`, [submissionId]);
    throw error;
  }
  return safeSubmission(await instructorSubmission(submissionId, instructorId));
}

async function analyzeSubmission(submissionId, instructorId, { review = defaultReview } = {}) {
  const row = await instructorSubmission(submissionId, instructorId);
  if (row.status === 'GRADED') throw new AppError('A graded submission cannot be reanalyzed.', 409);
  if (row.recognition_status !== 'READY' || (!clean(row.extracted_solution_text, 50000) && !(row.recognized_math || []).length)) {
    throw new AppError('Recognize the submitted solution before requesting AI analysis.', 409);
  }
  let excerpt = '';
  try { excerpt = approvedExcerpt(await contextService.getApprovedForReasoning(row.lesson_id, instructorId)); } catch (_error) { excerpt = ''; }
  const raw = await review({
    activity: { problem: clean(row.problem_text, 20000), instructions: clean(row.instructions, 10000), expectedSolutionOrRubric: clean(row.rubric_text, 20000) },
    studentSolution: { extractedText: clean(row.extracted_solution_text, 50000), math: (row.recognized_math || []).slice(0, 100), recognitionWarnings: row.recognition_result?.warnings || [] },
    approvedLessonContextExcerpt: excerpt,
  });
  const validation = reviewSchema.safeParse(raw);
  if (!validation.success) {
    throw new AppError('AI returned an invalid advisory review. Please try again.', 422);
  }
  const parsed = validation.data;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const current = await instructorSubmission(submissionId, instructorId, client, true);
    if (current.submission_revision !== row.submission_revision || current.status === 'GRADED') throw new AppError('The submission changed while it was being analyzed. No AI review was saved.', 409);
    await client.query(`INSERT INTO solution_submission_ai_reviews
      (submission_id,submission_revision,instructor_id,assessment,summary,strengths,possible_errors,suggested_feedback,confidence,provider,provider_model)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,'GEMINI',$10)`,
      [submissionId, row.submission_revision, instructorId, parsed.assessment, parsed.summary, JSON.stringify(parsed.strengths), JSON.stringify(parsed.possible_errors), parsed.suggested_feedback, parsed.confidence, GEMINI_REASONING_MODEL]);
    await client.query(`UPDATE solution_submissions SET status='AI_REVIEWED',updated_at=NOW() WHERE id=$1`, [submissionId]);
    await client.query('COMMIT');
  } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
  return safeSubmission(await instructorSubmission(submissionId, instructorId));
}

async function gradeSubmission(submissionId, instructorId, body = {}) {
  const row = await instructorSubmission(submissionId, instructorId);
  const score = Number(body.finalScore), feedback = clean(body.instructorFeedback, 10000);
  const maxPoints = Number(row.max_points);
  if (!Number.isFinite(score) || score < 0 || score > maxPoints) throw new AppError(`Score must be between 0 and ${maxPoints}.`, 400);
  const { rows } = await pool.query(`UPDATE solution_submissions SET final_score=$3,instructor_feedback=$4,graded_by=$2,
    graded_at=NOW(),feedback_released_at=NOW(),status='GRADED',updated_at=NOW()
    WHERE id=$1 AND EXISTS(SELECT 1 FROM solution_activities activity WHERE activity.id=solution_submissions.activity_id AND activity.instructor_id=$2)
    RETURNING *`, [submissionId, instructorId, score, feedback]);
  if (!rows.length) throw new AppError('Solution submission not found or access denied.', 404);
  return safeSubmission(await instructorSubmission(submissionId, instructorId));
}

async function reopenSubmission(submissionId, instructorId) {
  const row = await instructorSubmission(submissionId, instructorId);
  if (row.status !== 'GRADED') throw new AppError('Only a graded submission can be reopened.', 409);
  if (row.activity_status !== 'PUBLISHED' || (row.due_at && new Date(row.due_at) < new Date())) {
    throw new AppError('Reopen the solution activity before allowing a resubmission.', 409);
  }
  await pool.query(`UPDATE solution_submissions SET
    final_score=NULL,instructor_feedback=NULL,graded_by=NULL,graded_at=NULL,feedback_released_at=NULL,
    status=CASE WHEN recognition_status='READY' THEN 'READY_FOR_REVIEW' ELSE 'SUBMITTED' END,
    submission_revision=submission_revision+1,updated_at=NOW()
    WHERE id=$1`, [submissionId]);
  return safeSubmission(await instructorSubmission(submissionId, instructorId));
}

async function submissionImage(submissionId, user) {
  const values = [submissionId, user.id];
  const roleClause = user.role === 'INSTRUCTOR'
    ? 'activity.instructor_id=$2'
    : user.role === 'STUDENT'
      ? "submission.student_id=$2 AND activity.status IN ('PUBLISHED','CLOSED')"
      : 'FALSE';
  const { rows } = await pool.query(`SELECT submission.storage_key,submission.mime_type FROM solution_submissions submission
    JOIN solution_activities activity ON activity.id=submission.activity_id WHERE submission.id=$1 AND ${roleClause}`, values);
  if (!rows.length) throw new AppError('Solution image not found or access denied.', 404);
  const opened = await solutionSubmissionStorage.open(rows[0].storage_key);
  return { ...opened, mime: rows[0].mime_type };
}

module.exports = {
  listInstructor, createActivity, updateActivity, setActivityStatus, deleteActivity,
  listStudent, submitSolution, listSubmissions, retryRecognition, analyzeSubmission,
  gradeSubmission, reopenSubmission, submissionImage,
};
