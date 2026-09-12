const crypto = require('node:crypto');
const pool = require('../db/pool');
const AppError = require('../utils/AppError');
const { validateImageFile } = require('../utils/imageFile');
const { solutionSubmissionStorage: storage } = require('../storage');
const { studentSolution } = require('../utils/quizProblemSettings');
const { recalculateAttempt } = require('./phase6.service');
const contextService = require('./lesson-context.service');
const { recognizeImage, defaultReview, approvedExcerpt, reviewSchema } = require('./solution-review.service');

const extensions = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' };
const clean = (value, limit) => String(value ?? '').trim().slice(0, limit);
const detailQuery = `SELECT aa.*,a.student_id,a.status attempt_status,a.quiz_id,a.lesson_id,
  qq.question_order,qq.question_type,qq.prompt,qq.max_points,qq.problem_settings,
  u.first_name,u.last_name,u.student_number
  FROM quiz_attempt_answers aa JOIN quiz_attempts a ON a.id=aa.attempt_id
  JOIN lesson_quiz_questions qq ON qq.id=aa.question_id AND qq.quiz_id=a.quiz_id
  JOIN lesson_quizzes q ON q.id=a.quiz_id JOIN lesson_sessions l ON l.id=a.lesson_id
  JOIN users u ON u.id=a.student_id`;

async function ownedAnswer(id, instructorId, client = pool) {
  const { rows } = await client.query(detailQuery + ` WHERE aa.id=$1 AND q.instructor_id=$2 AND l.instructor_id=$2
    AND a.status IN ('SUBMITTED','GRADED') AND (qq.manual_grading OR qq.question_type IN ('SHORT_ANSWER','PROBLEM_SOLVING'))`, [id, instructorId]);
  if (!rows.length) throw new AppError('Submitted quiz answer not found or access denied.', 404);
  return rows[0];
}
function instructorAnswer(row) {
  return {
    id: row.id, attemptId: row.attempt_id, questionId: row.question_id, order: row.question_order,
    type: row.question_type, prompt: row.prompt, answer: row.answer_text,
    maxPoints: Number(row.max_points), problemSettings: row.problem_settings,
    student: { id: row.student_id, name: [row.first_name, row.last_name].join(' '), studentNumber: row.student_number },
    solution: studentSolution(row), recognitionStatus: row.recognition_status,
    recognizedText: row.recognition_result?.plainText || '',
    recognizedMath: row.recognition_result?.mathExpressions || [],
    recognitionFailure: row.recognition_failure, aiReview: row.ai_review,
    pointsAwarded: row.points_awarded == null ? null : Number(row.points_awarded),
    instructorFeedback: row.instructor_feedback, gradedAt: row.graded_at,
  };
}

async function uploadSolution(attemptId, questionId, studentId, file) {
  const mime = validateImageFile(file, 'Solution');
  const client = await pool.connect();
  let key, previous;
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(`SELECT a.*,q.status quiz_status,qq.question_type
      FROM quiz_attempts a JOIN lesson_quizzes q ON q.id=a.quiz_id
      JOIN lesson_quiz_questions qq ON qq.quiz_id=q.id AND qq.id=$2
      JOIN enrollments e ON e.section_id=a.section_id AND e.student_id=a.student_id
      JOIN users instructor ON instructor.id=q.instructor_id
      WHERE a.id=$1 AND a.student_id=$3 AND e.status='APPROVED' AND instructor.status='ACTIVE' FOR UPDATE OF a`, [attemptId, questionId, studentId]);
    const attempt = rows[0];
    if (!attempt) throw new AppError('Quiz question not found or access denied.', 404);
    if (attempt.status !== 'IN_PROGRESS' || attempt.quiz_status !== 'PUBLISHED') throw new AppError('This quiz attempt is not accepting uploads.', 409);
    if (attempt.question_type !== 'PROBLEM_SOLVING') throw new AppError('This question does not require a solution image.', 400);
    const existing = await client.query('SELECT solution_file FROM quiz_attempt_answers WHERE attempt_id=$1 AND question_id=$2', [attemptId, questionId]);
    previous = existing.rows[0]?.solution_file?.key;
    key = `quiz/${studentId}/${attemptId}/${questionId}/${crypto.randomUUID()}.${extensions[mime]}`;
    await storage.put(key, file.buffer);
    const saved = await client.query(`INSERT INTO quiz_attempt_answers(attempt_id,question_id,solution_file,solution_revision)
      VALUES($1,$2,$3,1) ON CONFLICT(attempt_id,question_id) DO UPDATE SET solution_file=EXCLUDED.solution_file,
      solution_revision=quiz_attempt_answers.solution_revision+1,recognition_status='PENDING',recognition_result=NULL,
      recognition_failure=NULL,ai_review=NULL,is_correct=NULL,points_awarded=NULL,updated_at=NOW() RETURNING *`,
      [attemptId, questionId, JSON.stringify({ key, mime, size: file.buffer.length })]);
    await client.query('COMMIT');
    if (previous) await storage.delete(previous).catch(() => {});
    // Upload deliberately does not call OCR or advisory AI. Original work is durable first.
    return studentSolution(saved.rows[0]);
  } catch (error) {
    await client.query('ROLLBACK');
    if (key) await storage.delete(key).catch(() => {});
    throw error;
  } finally { client.release(); }
}

async function listSolutions(quizId, instructorId) {
  const own = await pool.query(`SELECT q.id FROM lesson_quizzes q JOIN lesson_sessions l ON l.id=q.lesson_id
    WHERE q.id=$1 AND q.instructor_id=$2 AND l.instructor_id=$2`, [quizId, instructorId]);
  if (!own.rowCount) throw new AppError('Quiz not found or access denied.', 404);
  const { rows } = await pool.query(detailQuery + ` WHERE q.id=$1 AND q.instructor_id=$2 AND l.instructor_id=$2
    AND a.status IN ('SUBMITTED','GRADED') AND (qq.manual_grading OR qq.question_type IN ('SHORT_ANSWER','PROBLEM_SOLVING'))
    ORDER BY u.last_name,u.first_name,a.id,qq.question_order`, [quizId, instructorId]);
  return rows.map(instructorAnswer);
}

// Coalesce duplicate requests in this worker; a DB claim also protects recognition across workers.
const active = new Set();
async function recognize(id, instructorId, { extract = recognizeImage } = {}) {
  const row = await ownedAnswer(id, instructorId);
  if (!row.solution_file || row.graded_at) throw new AppError('An ungraded solution image is required.', 409);
  const claim = await pool.query(`UPDATE quiz_attempt_answers SET recognition_status='PROCESSING',recognition_failure=NULL,ai_review=NULL,updated_at=NOW()
    WHERE id=$1 AND solution_revision=$2 AND graded_at IS NULL
      AND (recognition_status<>'PROCESSING' OR updated_at<NOW()-INTERVAL '5 minutes') RETURNING id`, [id, row.solution_revision]);
  if (!claim.rowCount) throw new AppError('Solution recognition is already running.', 409);
  try {
    const opened = await storage.open(row.solution_file.key);
    const chunks = []; for await (const chunk of opened.stream) chunks.push(chunk);
    const normalized = await extract(Buffer.concat(chunks), row.solution_file.mime);
    if (!normalized || (!normalized.plainText && !normalized.mathExpressions?.length)) throw new AppError('No readable solution was recognized.', 422);
    const saved = await pool.query(`UPDATE quiz_attempt_answers SET recognition_result=$3,recognition_status='READY',recognition_failure=NULL,updated_at=NOW()
      WHERE id=$1 AND solution_revision=$2 AND graded_at IS NULL RETURNING id`, [id, row.solution_revision, JSON.stringify(normalized)]);
    if (!saved.rowCount) throw new AppError('The answer changed during recognition. No recognition was saved.', 409);
  } catch (error) {
    await pool.query(`UPDATE quiz_attempt_answers SET recognition_status='FAILED',
      recognition_failure='Recognition failed. The original image is preserved; retry or grade manually.',updated_at=NOW()
      WHERE id=$1 AND solution_revision=$2 AND graded_at IS NULL`, [id, row.solution_revision]);
    throw error;
  }
  return instructorAnswer(await ownedAnswer(id, instructorId));
}

async function analyze(id, instructorId, { review = defaultReview } = {}) {
  if (active.has(id)) throw new AppError('AI analysis is already running.', 409);
  active.add(id);
  try {
    const row = await ownedAnswer(id, instructorId);
    if (row.recognition_status !== 'READY') throw new AppError('Recognize the solution before AI analysis.', 409);
    let excerpt = '';
    try { excerpt = approvedExcerpt(await contextService.getApprovedForReasoning(row.lesson_id, instructorId)); }
    catch (error) { if (error.statusCode !== 404 && error.statusCode !== 409 && error.status !== 404 && error.status !== 409) throw error; }
    const parsed = reviewSchema.safeParse(await review({
      activity: { problem: clean(row.prompt, 10000), instructions: clean(row.problem_settings?.instructions, 4000),
        expectedSolutionOrRubric: clean(row.problem_settings?.rubric, 12000), maxPoints: Number(row.max_points) },
      studentSolution: { extractedText: clean(row.recognition_result?.plainText, 12000),
        math: (row.recognition_result?.mathExpressions || []).slice(0, 30),
        recognitionWarnings: (row.recognition_result?.warnings || []).slice(0, 12) },
      approvedLessonContextExcerpt: excerpt,
    }));
    if (!parsed.success) throw new AppError('AI returned an invalid advisory review. No grade was changed.', 422);
    const maxScore=Number(row.max_points);
    const suggestedScore=Math.round(Number(parsed.data.suggested_score)*100)/100;
    if(!Number.isFinite(suggestedScore)||suggestedScore<0||suggestedScore>maxScore){
      throw new AppError('AI returned an invalid suggested score. No grade was changed.',422);
    }
    // Advisory writes ONLY ai_review. Never points_awarded, is_correct, grade, or attempt score.
    const saved = await pool.query(`UPDATE quiz_attempt_answers SET ai_review=$3,updated_at=NOW()
      WHERE id=$1 AND solution_revision=$2 AND recognition_status='READY'
        AND recognition_result=$4::jsonb RETURNING id`,
      [id, row.solution_revision, JSON.stringify({ ...parsed.data, suggested_score:suggestedScore, max_score:maxScore, reviewedAt: new Date().toISOString() }), JSON.stringify(row.recognition_result)]);
    if (!saved.rowCount) throw new AppError('The answer changed during analysis. No review was saved.', 409);
    return instructorAnswer(await ownedAnswer(id, instructorId));
  } finally { active.delete(id); }
}

async function grade(id, instructorId, body = {}) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    let row = await ownedAnswer(id, instructorId, client);
    await client.query('SELECT id FROM quiz_attempts WHERE id=$1 FOR UPDATE', [row.attempt_id]);
    row = await ownedAnswer(id, instructorId, client);
    const points = Number(body.pointsAwarded);
    if (body.pointsAwarded == null || String(body.pointsAwarded).trim() === '' || !Number.isFinite(points)
      || points < 0 || points > Number(row.max_points) || Math.round(points * 100) / 100 !== points) {
      throw new AppError('Enter an official score from 0 to ' + row.max_points + ' (up to two decimals).', 422);
    }
    await client.query(`UPDATE quiz_attempt_answers SET points_awarded=$2,instructor_feedback=$3,graded_by=$4,
      graded_at=NOW(),updated_at=NOW() WHERE id=$1`, [id, points, clean(body.instructorFeedback, 10000), instructorId]);
    await recalculateAttempt(row.attempt_id, client);
    await client.query('COMMIT');
    return instructorAnswer(await ownedAnswer(id, instructorId));
  } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
}

async function image(id, user) {
  let row;
  if (user.role === 'INSTRUCTOR') row = await ownedAnswer(id, user.id);
  else if (user.role === 'STUDENT') {
    const result = await pool.query(`SELECT aa.* FROM quiz_attempt_answers aa JOIN quiz_attempts a ON a.id=aa.attempt_id
      JOIN lesson_quizzes q ON q.id=a.quiz_id JOIN enrollments e ON e.section_id=a.section_id AND e.student_id=a.student_id
      JOIN users instructor ON instructor.id=q.instructor_id
      WHERE aa.id=$1 AND a.student_id=$2 AND e.status='APPROVED' AND instructor.status='ACTIVE' AND q.status='PUBLISHED'`, [id, user.id]);
    row = result.rows[0];
  }
  if (!row?.solution_file) throw new AppError('Solution image not found or access denied.', 404);
  return { ...await storage.open(row.solution_file.key), mime: row.solution_file.mime };
}


async function reviewAttempts(quizId, instructorId) {
  const own = await pool.query(`SELECT q.id,q.title,q.lesson_id,l.section_id FROM lesson_quizzes q JOIN lesson_sessions l ON l.id=q.lesson_id
    WHERE q.id=$1 AND q.instructor_id=$2 AND l.instructor_id=$2`, [quizId,instructorId]);
  if (!own.rowCount) throw new AppError('Quiz not found or access denied.',404);
  const result = await pool.query(`SELECT a.id,a.status,a.score,a.max_score,a.submitted_at,
    u.first_name||' '||u.last_name student_name,
    COALESCE(SUM(aa.points_awarded) FILTER(WHERE NOT qq.manual_grading AND qq.question_type NOT IN ('SHORT_ANSWER','PROBLEM_SOLVING')),0) objective_score,
    COALESCE(SUM(qq.max_points) FILTER(WHERE NOT qq.manual_grading AND qq.question_type NOT IN ('SHORT_ANSWER','PROBLEM_SOLVING')),0) objective_max,
    COUNT(*) FILTER(WHERE (qq.manual_grading OR qq.question_type IN ('SHORT_ANSWER','PROBLEM_SOLVING')) AND aa.points_awarded IS NULL)::int pending
    FROM quiz_attempts a JOIN users u ON u.id=a.student_id JOIN lesson_quiz_questions qq ON qq.quiz_id=a.quiz_id
    LEFT JOIN quiz_attempt_answers aa ON aa.attempt_id=a.id AND aa.question_id=qq.id
    WHERE a.quiz_id=$1 GROUP BY a.id,u.first_name,u.last_name ORDER BY a.submitted_at DESC NULLS LAST,a.id`,[quizId]);
  const responses = await pool.query(`SELECT a.id attempt_id,qq.id question_id,qq.question_order,qq.question_type,qq.prompt,
    qq.correct_answer,qq.max_points,qq.manual_grading,aa.answer_text,aa.is_correct,aa.points_awarded
    FROM quiz_attempts a JOIN lesson_quiz_questions qq ON qq.quiz_id=a.quiz_id
    LEFT JOIN quiz_attempt_answers aa ON aa.attempt_id=a.id AND aa.question_id=qq.id
    WHERE a.quiz_id=$1 AND a.status IN ('SUBMITTED','GRADED') ORDER BY qq.question_order`,[quizId]);
  return { quiz: { id:own.rows[0].id,title:own.rows[0].title,lessonId:own.rows[0].lesson_id,sectionId:own.rows[0].section_id },
    attempts: result.rows.map(row=>({ id:row.id,studentName:row.student_name,status:row.status,submittedAt:row.submitted_at,
      score:row.status==='GRADED'?Number(row.score):null,maxScore:row.max_score==null?null:Number(row.max_score),
      objectiveScore:Number(row.objective_score),objectiveMax:Number(row.objective_max),pending:row.status==='IN_PROGRESS'?0:row.pending,
      responses:responses.rows.filter(item=>item.attempt_id===row.id).map(item=>({questionId:item.question_id,order:item.question_order,
        type:item.question_type,prompt:item.prompt,answer:item.answer_text||'',correctAnswer:item.correct_answer,
        isCorrect:item.is_correct,pointsAwarded:item.points_awarded==null?null:Number(item.points_awarded),
        maxPoints:Number(item.max_points),manualGrading:item.manual_grading||['SHORT_ANSWER','PROBLEM_SOLVING'].includes(item.question_type)}))
    })) };
}
async function sectionReviews(sectionId, instructorId) {
  const owned = await pool.query('SELECT id FROM sections WHERE id=$1 AND instructor_id=$2', [sectionId,instructorId]);
  if (!owned.rowCount) throw new AppError('Section not found or access denied.',404);
  const { rows } = await pool.query(`SELECT q.id quiz_id,q.title,q.status,l.id lesson_id,l.title lesson_title,
    COUNT(DISTINCT a.id) FILTER(WHERE a.status IN ('SUBMITTED','GRADED'))::int submitted_attempts,
    COUNT(DISTINCT a.id) FILTER(WHERE a.status='GRADED')::int graded_attempts,
    COUNT(DISTINCT qq.id) FILTER(WHERE qq.question_type='PROBLEM_SOLVING')::int problem_questions,
    COUNT(*) FILTER(WHERE a.status='SUBMITTED'
      AND (qq.manual_grading OR qq.question_type IN ('SHORT_ANSWER','PROBLEM_SOLVING'))
      AND aa.points_awarded IS NULL)::int pending_responses
    FROM lesson_quizzes q JOIN lesson_sessions l ON l.id=q.lesson_id
    LEFT JOIN quiz_attempts a ON a.quiz_id=q.id AND a.section_id=$1
    LEFT JOIN lesson_quiz_questions qq ON qq.quiz_id=q.id
    LEFT JOIN quiz_attempt_answers aa ON aa.attempt_id=a.id AND aa.question_id=qq.id
    WHERE l.section_id=$1 AND q.instructor_id=$2 AND l.instructor_id=$2 AND q.status IN ('PUBLISHED','DISABLED')
    GROUP BY q.id,l.id ORDER BY l.started_at DESC NULLS LAST,q.created_at DESC`,[sectionId,instructorId]);
  const quizzes=rows.map(row=>({quizId:row.quiz_id,title:row.title,status:row.status,lessonId:row.lesson_id,
    lessonTitle:row.lesson_title,submittedAttempts:row.submitted_attempts,gradedAttempts:row.graded_attempts,
    problemSolvingQuestions:row.problem_questions,pendingResponses:row.pending_responses}));
  return { sectionId,summary:{pendingResponses:quizzes.reduce((sum,row)=>sum+row.pendingResponses,0),
    submittedAttempts:quizzes.reduce((sum,row)=>sum+row.submittedAttempts,0),
    gradedAttempts:quizzes.reduce((sum,row)=>sum+row.gradedAttempts,0)},quizzes };
}

async function reviewQueue(instructorId) {
  const result=await pool.query(`SELECT q.id quiz_id,q.title,l.id lesson_id,s.id section_id,s.section_name,
    COUNT(*)::int pending,COUNT(DISTINCT a.id)::int attempts
    FROM quiz_attempts a JOIN lesson_quizzes q ON q.id=a.quiz_id JOIN lesson_sessions l ON l.id=q.lesson_id
    JOIN sections s ON s.id=a.section_id JOIN lesson_quiz_questions qq ON qq.quiz_id=q.id
    LEFT JOIN quiz_attempt_answers aa ON aa.attempt_id=a.id AND aa.question_id=qq.id
    WHERE q.instructor_id=$1 AND l.instructor_id=$1 AND a.status='SUBMITTED'
      AND (qq.manual_grading OR qq.question_type IN ('SHORT_ANSWER','PROBLEM_SOLVING')) AND aa.points_awarded IS NULL
    GROUP BY q.id,l.id,s.id ORDER BY s.section_name,q.title`,[instructorId]);
  return result.rows.map(row=>({quizId:row.quiz_id,title:row.title,lessonId:row.lesson_id,sectionId:row.section_id,sectionName:row.section_name,pending:row.pending,attempts:row.attempts}));
}

module.exports = { reviewAttempts, sectionReviews, reviewQueue, uploadSolution, listSolutions, recognize, analyze, grade, image };
