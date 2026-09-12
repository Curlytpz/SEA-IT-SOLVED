const crypto = require('node:crypto');
const { z } = require('zod');
const pool = require('../db/pool');
const AppError = require('../utils/AppError');
const GeminiReasoningProvider = require('../reasoning/GeminiReasoningProvider');
const interactive = require('./geminiInteractive.service');
const {
  GEMINI_API_KEY,
  GEMINI_CHAT_MODEL,
  GEMINI_INTERACTIVE_TIMEOUT_MS,
  QUIZ_TUTOR_MAX_PRACTICE_PER_ATTEMPT,
  QUIZ_TUTOR_PROCESSING_STALE_MS,
} = require('../config/env');

const provider = new GeminiReasoningProvider({
  apiKey: GEMINI_API_KEY,
  model: GEMINI_CHAT_MODEL,
  timeoutMs: GEMINI_INTERACTIVE_TIMEOUT_MS,
});

const text = max => z.string().trim().min(1).max(max);
const reportSchema = z.object({
  summary: text(1600),
  weakTopics: z.array(text(180)).max(8),
  mistakes: z.array(z.object({
    questionId: text(100),
    mistakeSummary: text(900),
    keyConcept: text(500),
    explanation: text(1800),
    recommendedSteps: z.array(text(500)).min(1).max(5),
  })).min(1).max(50),
  recommendedReview: z.array(text(180)).max(8),
});
const practiceSchema = z.object({
  topic: text(255),
  question: text(2000),
  choices: z.array(text(800)).length(4),
  correctAnswer: text(800),
  explanation: text(1600),
});

const normalize = value => String(value || '').trim().replace(/\s+/g, ' ').toLocaleLowerCase();
const clean = (value, max) => String(value || '').trim().slice(0, max);
const isStale = value => !value || Date.now() - new Date(value).getTime() >= QUIZ_TUTOR_PROCESSING_STALE_MS;
const uniqueText = values => [...new Set((values || []).map(value => clean(value, 180)).filter(Boolean))];

function invalidProviderOutput(message) {
  const error = new Error(message);
  error.code = 'INVALID_PROVIDER_OUTPUT';
  error.retryable = false;
  return error;
}

function validateReport(raw, mistakes) {
  const parsed = reportSchema.safeParse(raw);
  if (!parsed.success) throw invalidProviderOutput('The tutor response did not match the required structure.');
  const expected = new Map(mistakes.map(item => [String(item.questionId), item]));
  const seen = new Set();
  for (const item of parsed.data.mistakes) {
    if (!expected.has(item.questionId) || seen.has(item.questionId)) {
      throw invalidProviderOutput('The tutor response referenced an unexpected quiz question.');
    }
    seen.add(item.questionId);
  }
  if (seen.size !== expected.size) throw invalidProviderOutput('The tutor response omitted a finalized mistake.');
  return {
    summary: clean(parsed.data.summary, 1600),
    weakTopics: uniqueText(parsed.data.weakTopics),
    mistakes: parsed.data.mistakes.map(item => ({
      questionId: item.questionId,
      questionOrder: expected.get(item.questionId).questionOrder,
      mistakeSummary: clean(item.mistakeSummary, 900),
      keyConcept: clean(item.keyConcept, 500),
      explanation: clean(item.explanation, 1800),
      recommendedSteps: item.recommendedSteps.map(value => clean(value, 500)).filter(Boolean),
    })),
    recommendedReview: uniqueText(parsed.data.recommendedReview),
  };
}

function validatePractice(raw, fallbackTopic) {
  const parsed = practiceSchema.safeParse(raw);
  if (!parsed.success) throw invalidProviderOutput('The practice response did not match the required structure.');
  const choices = parsed.data.choices.map(value => clean(value, 800));
  if (new Set(choices.map(normalize)).size !== 4) throw invalidProviderOutput('The practice choices were not distinct.');
  const correctAnswer = choices.find(choice => normalize(choice) === normalize(parsed.data.correctAnswer));
  if (!correctAnswer) throw invalidProviderOutput('The practice answer did not match a choice.');
  return {
    // The server-selected weak topic is authoritative; provider output cannot retarget practice.
    topic: clean(fallbackTopic, 255),
    question: clean(parsed.data.question, 2000),
    choices,
    correctAnswer,
    explanation: clean(parsed.data.explanation, 1600),
  };
}

async function ownedAttempt(attemptId, studentId, client = pool) {
  const { rows } = await client.query(`SELECT a.*,q.title quiz_title,q.status quiz_status,l.title lesson_title,l.topic lesson_topic
    FROM quiz_attempts a
    JOIN lesson_quizzes q ON q.id=a.quiz_id
    JOIN lesson_sessions l ON l.id=a.lesson_id
    JOIN enrollments e ON e.section_id=a.section_id AND e.student_id=a.student_id
    JOIN users instructor ON instructor.id=q.instructor_id
    WHERE a.id=$1 AND a.student_id=$2 AND e.status='APPROVED' AND instructor.status='ACTIVE'`, [attemptId, studentId]);
  if (!rows.length) throw new AppError('Quiz attempt not found.', 404);
  if (rows[0].quiz_status !== 'PUBLISHED') throw new AppError('This quiz result is not currently available.', 409, { code: 'QUIZ_UNAVAILABLE' });
  return rows[0];
}

async function finalizedMistakes(attempt, client = pool) {
  const { rows } = await client.query(`SELECT qq.id,qq.question_order,qq.question_type,qq.topic,qq.prompt,qq.correct_answer,
      qq.explanation,qq.manual_grading,qq.max_points,aa.answer_text,aa.is_correct,aa.points_awarded,
      aa.instructor_feedback,aa.recognition_result
    FROM lesson_quiz_questions qq
    LEFT JOIN quiz_attempt_answers aa ON aa.question_id=qq.id AND aa.attempt_id=$2
    WHERE qq.quiz_id=$1 ORDER BY qq.question_order`, [attempt.quiz_id, attempt.id]);
  return rows.filter(row => {
    const manual = row.manual_grading || ['SHORT_ANSWER','PROBLEM_SOLVING'].includes(row.question_type);
    return manual ? Number(row.points_awarded || 0) < Number(row.max_points || 1) : row.is_correct === false;
  }).map(row => {
    const manual = row.manual_grading || ['SHORT_ANSWER','PROBLEM_SOLVING'].includes(row.question_type);
    const recognized = row.recognition_result?.normalized?.plainText || row.recognition_result?.plainText || '';
    return {
      questionId: row.id,
      questionOrder: row.question_order,
      type: row.question_type,
      topic: clean(row.topic || attempt.lesson_topic || 'Lesson topic', 255),
      question: clean(row.prompt, 4000),
      studentAnswer: clean(row.answer_text || recognized || (row.question_type === 'PROBLEM_SOLVING' ? '[Handwritten solution submitted]' : '[No answer]'), 4000),
      correctAnswer: manual ? '' : clean(row.correct_answer, 2000),
      existingSolutionOrExplanation: manual ? clean(row.instructor_feedback, 2000) : clean(row.explanation, 2000),
      officialPoints: Number(row.points_awarded || 0),
      maxPoints: Number(row.max_points || 1),
    };
  });
}

function practicePayload(row) {
  const content = row.content || {};
  const answered = row.student_answer != null;
  return {
    id: row.id,
    order: row.practice_order,
    topic: row.topic,
    question: content.question || '',
    choices: content.choices || [],
    answered,
    studentAnswer: answered ? row.student_answer : null,
    isCorrect: answered ? row.is_correct : null,
    ...(answered ? { correctAnswer: content.correctAnswer || '', explanation: content.explanation || '' } : {}),
  };
}

async function readyPractices(reportId, studentId, client = pool) {
  const { rows } = await client.query(`SELECT * FROM quiz_tutor_practices
    WHERE report_id=$1 AND student_id=$2 AND status='READY' ORDER BY practice_order`, [reportId, studentId]);
  return rows.map(practicePayload);
}

async function readyPayload(reportRow, studentId, client = pool) {
  const practices = await readyPractices(reportRow.id, studentId, client);
  const latest = (await client.query(`SELECT * FROM quiz_tutor_practices
    WHERE report_id=$1 AND student_id=$2 ORDER BY practice_order DESC LIMIT 1`, [reportRow.id, studentId])).rows[0];
  const activePractice = latest?.status === 'READY' ? practicePayload(latest) : null;
  return {
    status: 'READY',
    eligible: true,
    report: reportRow.report,
    generatedAt: reportRow.generated_at,
    practices,
    activePractice,
    practiceStatus: latest?.status || 'IDLE',
    practiceFailure: latest?.status === 'FAILED' ? 'Unable to generate the next practice problem.' : null,
    practiceLimit: QUIZ_TUTOR_MAX_PRACTICE_PER_ATTEMPT,
    practiceRemaining: Math.max(0, QUIZ_TUTOR_MAX_PRACTICE_PER_ATTEMPT - practices.length),
  };
}

async function getTutor(attemptId, studentId) {
  const attempt = await ownedAttempt(attemptId, studentId);
  if (attempt.status === 'IN_PROGRESS') throw new AppError('AI Tutor is available only after this quiz is submitted.', 409, { code: 'TUTOR_NOT_SUBMITTED' });
  if (attempt.status !== 'GRADED') return {
    status: 'AWAITING_REVIEW', eligible: false,
    message: 'Your AI Tutor will be available after your instructor finishes reviewing this quiz.',
  };
  const mistakes = await finalizedMistakes(attempt);
  if (!mistakes.length) return {
    status: 'ALL_CORRECT', eligible: false,
    message: 'Great work — you answered all questions correctly.',
    practiceLimit: QUIZ_TUTOR_MAX_PRACTICE_PER_ATTEMPT, practiceRemaining: QUIZ_TUTOR_MAX_PRACTICE_PER_ATTEMPT,
  };
  const { rows } = await pool.query('SELECT * FROM quiz_tutor_reports WHERE attempt_id=$1 AND student_id=$2', [attemptId, studentId]);
  const report = rows[0];
  if (report?.status === 'READY') return readyPayload(report, studentId);
  if (report?.status === 'PROCESSING' && !isStale(report.updated_at)) return {
    status: 'PROCESSING', eligible: true, message: 'Analyzing your quiz…',
  };
  return { status: 'AVAILABLE', eligible: true, report: null, practices: [],
    practiceLimit: QUIZ_TUTOR_MAX_PRACTICE_PER_ATTEMPT, practiceRemaining: QUIZ_TUTOR_MAX_PRACTICE_PER_ATTEMPT };
}

async function claimReport(attemptId, studentId) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const attempt = await ownedAttempt(attemptId, studentId, client);
    if (attempt.status === 'IN_PROGRESS') throw new AppError('AI Tutor is available only after this quiz is submitted.', 409, { code: 'TUTOR_NOT_SUBMITTED' });
    if (attempt.status !== 'GRADED') throw new AppError('Your AI Tutor will be available after your instructor finishes reviewing this quiz.', 409, { code: 'TUTOR_AWAITING_REVIEW' });
    const mistakes = await finalizedMistakes(attempt, client);
    if (!mistakes.length) {
      await client.query('COMMIT');
      return { kind: 'ALL_CORRECT', payload: { status: 'ALL_CORRECT', eligible: false, message: 'Great work — you answered all questions correctly.' } };
    }
    let report = (await client.query('SELECT * FROM quiz_tutor_reports WHERE attempt_id=$1 FOR UPDATE', [attemptId])).rows[0];
    if (report?.status === 'READY') {
      const payload = await readyPayload(report, studentId, client);
      await client.query('COMMIT');
      return { kind: 'CACHED', payload };
    }
    if (report?.status === 'PROCESSING' && !isStale(report.updated_at)) {
      throw new AppError('Your quiz analysis is already being prepared.', 409, { code: 'TUTOR_ANALYSIS_PROCESSING' });
    }
    const generationKey = crypto.randomUUID();
    if (report) {
      report = (await client.query(`UPDATE quiz_tutor_reports SET status='PROCESSING',report=NULL,model_version=NULL,
        generation_key=$2,failure_code=NULL,generated_at=NULL,updated_at=NOW() WHERE id=$1 RETURNING *`, [report.id, generationKey])).rows[0];
    } else {
      const inserted = await client.query(`INSERT INTO quiz_tutor_reports(attempt_id,student_id,generation_key)
        VALUES($1,$2,$3) ON CONFLICT(attempt_id) DO NOTHING RETURNING *`, [attemptId, studentId, generationKey]);
      report = inserted.rows[0];
      if (!report) {
        report = (await client.query('SELECT * FROM quiz_tutor_reports WHERE attempt_id=$1 FOR UPDATE', [attemptId])).rows[0];
        if (report?.status === 'READY') {
          const payload = await readyPayload(report, studentId, client);
          await client.query('COMMIT');
          return { kind: 'CACHED', payload };
        }
        throw new AppError('Your quiz analysis is already being prepared.', 409, { code: 'TUTOR_ANALYSIS_PROCESSING' });
      }
    }
    await client.query('COMMIT');
    return { kind: 'GENERATE', report, attempt, mistakes, generationKey };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally { client.release(); }
}

async function generateTutor(attemptId, studentId) {
  const claim = await claimReport(attemptId, studentId);
  if (claim.kind !== 'GENERATE') return claim.payload;
  try {
    const report = await interactive.run(async () => validateReport(await provider.generateQuizTutorReport({
      quizTitle: clean(claim.attempt.quiz_title, 255),
      relevantLessonTopic: clean(claim.attempt.lesson_topic || claim.attempt.lesson_title, 255),
      questionsAnsweredIncorrectly: claim.mistakes.map(({ questionOrder, ...item }) => item),
    }), claim.mistakes), {
      unavailable: 'AI Tutor could not generate your review right now.',
      invalidOutput: 'AI Tutor could not generate a valid review right now.',
      rateLimited: 'AI Tutor is busy right now. Please try again shortly.',
    }, { label: 'QuizTutor', model: GEMINI_CHAT_MODEL });
    const saved = (await pool.query(`UPDATE quiz_tutor_reports SET status='READY',report=$3::jsonb,model_version=$4,
      generation_key=NULL,failure_code=NULL,generated_at=NOW(),updated_at=NOW()
      WHERE id=$1 AND generation_key=$2 AND status='PROCESSING' RETURNING *`,
    [claim.report.id, claim.generationKey, JSON.stringify(report), GEMINI_CHAT_MODEL])).rows[0];
    if (!saved) throw new AppError('This tutor analysis was superseded. Please reload the result.', 409, { code: 'TUTOR_ANALYSIS_SUPERSEDED' });
    return readyPayload(saved, studentId);
  } catch (error) {
    await pool.query(`UPDATE quiz_tutor_reports SET status='FAILED',generation_key=NULL,failure_code=$3,updated_at=NOW()
      WHERE id=$1 AND generation_key=$2 AND status='PROCESSING'`, [claim.report.id, claim.generationKey, clean(error.code || 'PROVIDER_ERROR', 80)]).catch(() => {});
    throw error;
  }
}

async function claimPractice(attemptId, studentId) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const attempt = await ownedAttempt(attemptId, studentId, client);
    if (attempt.status !== 'GRADED') throw new AppError('Practice is available after your final quiz result is released.', 409, { code: 'TUTOR_AWAITING_REVIEW' });
    const report = (await client.query(`SELECT * FROM quiz_tutor_reports
      WHERE attempt_id=$1 AND student_id=$2 AND status='READY' FOR UPDATE`, [attemptId, studentId])).rows[0];
    if (!report) throw new AppError('Analyze your mistakes before generating practice.', 409, { code: 'TUTOR_REPORT_REQUIRED' });
    const rows = (await client.query('SELECT * FROM quiz_tutor_practices WHERE report_id=$1 ORDER BY practice_order FOR UPDATE', [report.id])).rows;
    const ready = rows.filter(row => row.status === 'READY');
    if (ready.length >= QUIZ_TUTOR_MAX_PRACTICE_PER_ATTEMPT) {
      throw new AppError("You've completed the available AI practice for this quiz.", 409, { code: 'TUTOR_PRACTICE_LIMIT' });
    }
    if (rows.some(row => row.status === 'PROCESSING' && !isStale(row.updated_at))) {
      throw new AppError('A practice question is already being prepared.', 409, { code: 'TUTOR_PRACTICE_PROCESSING' });
    }
    const reusable = rows.find(row => row.status === 'FAILED' || (row.status === 'PROCESSING' && isStale(row.updated_at)));
    const order = reusable?.practice_order || Math.max(0, ...rows.map(row => row.practice_order)) + 1;
    const topics = uniqueText([...(report.report?.weakTopics || []), ...(report.report?.recommendedReview || [])]);
    const topic = topics[(order - 1) % Math.max(1, topics.length)] || 'Lesson review';
    const generationKey = crypto.randomUUID();
    let practice;
    if (reusable) {
      practice = (await client.query(`UPDATE quiz_tutor_practices SET topic=$2,status='PROCESSING',content=NULL,
        student_answer=NULL,is_correct=NULL,model_version=NULL,generation_key=$3,failure_code=NULL,generated_at=NULL,updated_at=NOW()
        WHERE id=$1 RETURNING *`, [reusable.id, topic, generationKey])).rows[0];
    } else {
      practice = (await client.query(`INSERT INTO quiz_tutor_practices(report_id,attempt_id,student_id,practice_order,topic,generation_key)
        VALUES($1,$2,$3,$4,$5,$6) RETURNING *`, [report.id, attemptId, studentId, order, topic, generationKey])).rows[0];
    }
    await client.query('COMMIT');
    const related = (report.report?.mistakes || []).find(item => normalize(item.keyConcept) === normalize(topic)) || report.report?.mistakes?.[0] || null;
    return { attempt, report, practice, generationKey, topic, related };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally { client.release(); }
}

async function generatePractice(attemptId, studentId) {
  const claim = await claimPractice(attemptId, studentId);
  try {
    const content = await interactive.run(async () => validatePractice(await provider.generateQuizTutorPractice({
      quizTitle: clean(claim.attempt.quiz_title, 255),
      lessonTopic: clean(claim.attempt.lesson_topic || claim.attempt.lesson_title, 255),
      weakTopic: claim.topic,
      misconceptionToAddress: claim.related ? {
        mistakeSummary: clean(claim.related.mistakeSummary, 600),
        keyConcept: clean(claim.related.keyConcept, 300),
      } : null,
    }), claim.topic), {
      unavailable: 'AI Tutor could not create a practice question right now.',
      invalidOutput: 'AI Tutor could not create a valid practice question right now.',
      rateLimited: 'AI Tutor is busy right now. Please try again shortly.',
    }, { label: 'QuizTutorPractice', model: GEMINI_CHAT_MODEL });
    const saved = (await pool.query(`UPDATE quiz_tutor_practices SET topic=$3,status='READY',content=$4::jsonb,
      model_version=$5,generation_key=NULL,failure_code=NULL,generated_at=NOW(),updated_at=NOW()
      WHERE id=$1 AND generation_key=$2 AND status='PROCESSING' RETURNING *`,
    [claim.practice.id, claim.generationKey, content.topic, JSON.stringify(content), GEMINI_CHAT_MODEL])).rows[0];
    if (!saved) throw new AppError('This practice request was superseded. Please reload the result.', 409, { code: 'TUTOR_PRACTICE_SUPERSEDED' });
    const practices = await readyPractices(claim.report.id, studentId);
    return { practice: practicePayload(saved), practiceRemaining: Math.max(0, QUIZ_TUTOR_MAX_PRACTICE_PER_ATTEMPT - practices.length), practiceLimit: QUIZ_TUTOR_MAX_PRACTICE_PER_ATTEMPT };
  } catch (error) {
    await pool.query(`UPDATE quiz_tutor_practices SET status='FAILED',generation_key=NULL,failure_code=$3,updated_at=NOW()
      WHERE id=$1 AND generation_key=$2 AND status='PROCESSING'`, [claim.practice.id, claim.generationKey, clean(error.code || 'PROVIDER_ERROR', 80)]).catch(() => {});
    throw error;
  }
}

async function checkPractice(attemptId, practiceId, studentId, answer) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const attempt = await ownedAttempt(attemptId, studentId, client);
    if (attempt.status !== 'GRADED') throw new AppError('Practice is available after your final quiz result is released.', 409);
    let row = (await client.query(`SELECT p.* FROM quiz_tutor_practices p
      JOIN quiz_tutor_reports r ON r.id=p.report_id
      WHERE p.id=$1 AND p.attempt_id=$2 AND p.student_id=$3 AND r.status='READY' AND p.status='READY' FOR UPDATE OF p`,
    [practiceId, attemptId, studentId])).rows[0];
    if (!row) throw new AppError('Practice question not found.', 404);
    if (row.student_answer == null) {
      const selected = clean(answer, 800);
      const choice = (row.content?.choices || []).find(value => normalize(value) === normalize(selected));
      if (!choice) throw new AppError('Choose one of the available answers.', 422);
      row = (await client.query(`UPDATE quiz_tutor_practices SET student_answer=$2,is_correct=$3,updated_at=NOW()
        WHERE id=$1 RETURNING *`, [row.id, choice, normalize(choice) === normalize(row.content.correctAnswer)])).rows[0];
    }
    await client.query('COMMIT');
    return practicePayload(row);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally { client.release(); }
}

module.exports = {
  getTutor,
  generateTutor,
  generatePractice,
  checkPractice,
  validateReport,
  validatePractice,
  finalizedMistakes,
};
