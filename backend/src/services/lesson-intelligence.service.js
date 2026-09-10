const pool = require('../db/pool');
const AppError = require('../utils/AppError');
const { questionSettings } = require('../utils/quizProblemSettings');
const { quizGenerationSpec } = require('../utils/quizGenerationSpec');
const contextService = require('./lesson-context.service');
const geminiInteractive = require('./geminiInteractive.service');
const GeminiReasoningProvider = require('../reasoning/GeminiReasoningProvider');
const { comparableAnswer, normalizeGeneratedLessonTitle, normalizeGeneratedText } = require('../utils/generatedContent');
const { normalizeLessonMathContent } = require('../utils/mathContent');
const { buildLessonDocument } = require('./lesson-document.service');
const { randomizeMultipleChoiceQuestions } = require('../utils/quizOptions');
const {
  GEMINI_API_KEY, GEMINI_REASONING_MODEL, GEMINI_QUIZ_MODEL, GEMINI_QUIZ_TIMEOUT_MS,
  RECOGNITION_PROVIDER_TIMEOUT_MS,
} = require('../config/env');

const provider = new GeminiReasoningProvider({
  apiKey: GEMINI_API_KEY,
  model: GEMINI_REASONING_MODEL,
  timeoutMs: RECOGNITION_PROVIDER_TIMEOUT_MS,
});
const quizProvider = new GeminiReasoningProvider({
  apiKey: GEMINI_API_KEY,
  model: GEMINI_QUIZ_MODEL,
  timeoutMs: GEMINI_QUIZ_TIMEOUT_MS,
});

const MATERIAL_TYPES = ['SUMMARY','NOTES','EXPLANATION','KEY_FORMULAS','WORKED_EXAMPLE','COMMON_MISTAKES'];

async function lockApprovedContext(client, lessonId, instructorId, expectedId) {
  const current = await client.query(
    `SELECT id FROM lesson_context_versions WHERE lesson_id=$1 AND instructor_id=$2 AND status='APPROVED' FOR SHARE`,
    [lessonId, instructorId]
  );
  if (current.rows[0]?.id !== expectedId) {
    throw new AppError('The approved context changed. Reload the workspace and regenerate from the latest approved context.', 409);
  }
}

async function archiveDuplicateMaterials(client, lessonId, instructorId, contextVersionId) {
  await client.query(
    `WITH ranked AS (
       SELECT gm.id,
              row_number() OVER (
                PARTITION BY gm.material_type
                ORDER BY
                  CASE
                    WHEN gm.removed = TRUE AND EXISTS (
                      SELECT 1 FROM generated_material_edits edit
                      WHERE edit.generated_material_id = gm.id
                        AND edit.action = 'REMOVE_SECTION'
                        AND edit.undone_at IS NULL
                    ) THEN 0
                    WHEN gm.removed = FALSE THEN 1
                    ELSE 2
                  END,
                  gm.updated_at DESC,
                  gm.generated_at DESC,
                  gm.id DESC
              ) duplicate_rank
       FROM generated_lesson_materials gm
       WHERE gm.lesson_id=$1 AND gm.instructor_id=$2 AND gm.context_version_id=$3
     )
     UPDATE generated_lesson_materials gm
     SET removed=TRUE,published_at=NULL,published_snapshot=NULL,updated_at=NOW()
     FROM ranked
     WHERE gm.id=ranked.id AND ranked.duplicate_rank>1`,
    [lessonId, instructorId, contextVersionId]
  );
}

function materialRevision(rows) {
  return rows
    .map(row => [row.id, new Date(row.updated_at).toISOString(), row.removed, row.display_order].join(':'))
    .sort()
    .join('|');
}

function sourceLabel(chunk) {
  const source = chunk.source || {};
  if (chunk.type === 'WHITEBOARD') return `Whiteboard Page ${source.pageNumber}`;
  if (chunk.type === 'SPEECH') {
    const start = Math.floor(Number(source.lessonOffsetStartMs || 0) / 1000);
    const end = Math.ceil(Number(source.lessonOffsetEndMs || 0) / 1000);
    return `Transcript ${Math.floor(start / 60)}:${String(start % 60).padStart(2, '0')}–${Math.floor(end / 60)}:${String(end % 60).padStart(2, '0')}`;
  }
  if (chunk.type === 'PDF') return `${source.filename} • Page ${source.pdfPageNumber}`;
  return source.filename || 'Uploaded image';
}

async function approvedPayload(lessonId, instructorId) {
  const context = await contextService.getApprovedForReasoning(lessonId, instructorId);
  return {
    context,
    payload: context.chunks.map(chunk => ({
      type: chunk.type,
      source: sourceLabel(chunk),
      text: chunk.text,
      math: chunk.math,
      uncertain: chunk.uncertain,
    })),
  };
}

function invalidQuizOutput(message) {
  const error = new Error(message);
  error.code = 'INVALID_PROVIDER_OUTPUT';
  error.retryable = true;
  return error;
}

function normalizeMathField(value, { maxLength, label, errorFactory = message => new AppError(message, 400) } = {}) {
  const original = normalizeGeneratedText(value, { markdown: true, maxLength });
  if (!original) return '';
  const message = `${label || 'This field'} contains a math expression that needs review.`;
  if (/math(?:ematical)? expression needs review/i.test(original)) throw errorFactory(message);
  const normalized = normalizeLessonMathContent(original);
  if (normalized.needsReview.length) throw errorFactory(message);
  return normalized.content;
}

function safeMathField(value, maxLength) {
  const original = normalizeGeneratedText(value, { markdown: true, maxLength });
  if (!original) return '';
  const normalized = normalizeLessonMathContent(original);
  return normalized.needsReview.length ? original : normalized.content;
}

function normalizePersistedQuestion(row, index) {
  const errorFactory = message => new AppError(`${message} Edit and save the question before publishing.`, 409);
  const prefix = `Question ${index + 1}`;
  if (row.question_type === 'PROBLEM_SOLVING') {
    const { problemSettings } = questionSettings({ type: row.question_type }, row);
    if ((problemSettings.allowTip && !problemSettings.tip) || (problemSettings.allowFormula && !problemSettings.formula)) {
      throw new AppError(`${prefix}: store the enabled tip/formula before publishing, or switch it OFF.`, 409);
    }
  }
  return {
    prompt: normalizeMathField(row.prompt, { maxLength: 10000, label: `${prefix} prompt`, errorFactory }),
    choices: (Array.isArray(row.choices) ? row.choices : []).map((value, choiceIndex) => normalizeMathField(value, {
      maxLength: 2000,
      label: `${prefix} choice ${choiceIndex + 1}`,
      errorFactory,
    })),
    correctAnswer: normalizeMathField(row.correct_answer, { maxLength: 2000, label: `${prefix} correct answer`, errorFactory }),
    explanation: normalizeMathField(row.explanation, { maxLength: 4000, label: `${prefix} explanation`, errorFactory }),
  };
}

const QUIZ_DIFFICULTIES = new Set(['EASY', 'MEDIUM', 'HARD']);

function generationOptions(options = {}) {
  const difficulty = String(options.difficulty || '').trim().toUpperCase();
  const questionCount = Number(options.questionCount ?? 10);
  if (!QUIZ_DIFFICULTIES.has(difficulty)) throw new AppError('Choose a quiz difficulty: EASY, MEDIUM, or HARD.', 400);
  if (!Number.isInteger(questionCount) || questionCount < 5 || questionCount > 20) throw new AppError('Question count must be a whole number from 5 to 20.', 400);
  return { difficulty, questionCount };
}


function professionalQuizTitle(value, questions = []) {
  let topic = normalizeGeneratedText(value, { maxLength: 255 })
    .replace(/^(?:lesson|review)?\s*quiz\s*[:\-–—]?\s*/i, '')
    .replace(/\b(?:easy|medium|hard|advanced|comprehensive|mastery|level)\b/gi, '')
    .replace(/\b(?:quiz\s+)?assessment(?:\s+level)?\b/gi, '')
    .replace(/\b[^\s,;:()]+\.(?:png|jpe?g|pdf|docx?)\b/gi, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/^[\s:;,.\-–—]+|[\s:;,.\-–—]+$/g, '')
    .trim();
  if (!topic || /^(?:quiz|assessment|lesson)$/i.test(topic)) {
    topic = [...new Set(questions.map(question => question.topic).filter(Boolean))].slice(0, 2).join(' and ');
  }
  const concise = topic.split(/\s+/).filter(Boolean).slice(0, 7).join(' ');
  return concise ? `Quiz: ${concise}` : 'Lesson Quiz';
}

function professionalQuizInstructions(value, questionCount) {
  const fallback = `Answer all ${questionCount} questions.`;
  const instructions = normalizeGeneratedText(value, { markdown: true, maxLength: 10000 });
  if (!instructions) return fallback;
  if (/\b(?:strictly|provided lesson (?:materials?|context)|source references?|uploaded|whiteboard|OCR)\b/i.test(instructions)) return fallback;
  return instructions;
}

function normalizeQuiz(result, allowedSources, requestedCount, selectedDifficulty, specification = {}) {
  if (!result || !Array.isArray(result.questions) || !result.questions.length) {
    throw invalidQuizOutput('Gemini returned no quiz questions.');
  }
  if (result.questions.length !== requestedCount) {
    throw invalidQuizOutput(`Gemini returned ${result.questions.length} of ${requestedCount} requested questions.`);
  }
  const allowedTypes = new Set(['MULTIPLE_CHOICE', 'TRUE_FALSE', 'PROBLEM_SOLVING']);
  const questions = result.questions.map((item, index) => {
    const type = String(item.type || '').toUpperCase().replace(/[ /-]+/g, '_');
    if (!allowedTypes.has(type)) throw invalidQuizOutput(`Question ${index + 1} has an unsupported type.`);
    if (specification.questionTypes && type !== specification.questionTypes[index]) throw invalidQuizOutput(`Question ${index + 1} did not match its requested type.`);
    if (!specification.questionTypes && type === 'PROBLEM_SOLVING') throw invalidQuizOutput('Solution-required questions were not requested.');
    if (type === 'PROBLEM_SOLVING') {
      let settings;
      try {
        if (item.maxPoints == null || !item.problemSettings?.rubric?.trim()) throw new Error('Missing points/rubric.');
        settings = questionSettings({ ...item, type, problemSettings: {
          ...item.problemSettings, allowTip: specification.allowTip, allowFormula: specification.allowFormula,
        } });
        if ((specification.allowTip && !settings.problemSettings.tip) || (specification.allowFormula && !settings.problemSettings.formula)) throw new Error('Missing requested help.');
      } catch (_error) { throw invalidQuizOutput(`Question ${index + 1} needs valid points, an instructor rubric, and requested stored help.`); }
      let normalized;
      try { normalized = normalizeChatQuizQuestion({ ...item, ...settings, type, correctAnswer:'', choices:[], explanation:'' }, selectedDifficulty, index); }
      catch (_error) { throw invalidQuizOutput(`Question ${index + 1} has invalid problem-solving content.`); }
      const sourceReferences = [...new Set((Array.isArray(item.sourceReferences) ? item.sourceReferences : []).filter(reference => allowedSources.has(reference)))];
      if (!sourceReferences.length) throw invalidQuizOutput(`Question ${index + 1} is not linked to an approved lesson source.`);
      return { ...normalized, sourceReferences };
    }
    const prompt = normalizeMathField(item.prompt, {
      maxLength: 10000,
      label: `Question ${index + 1} prompt`,
      errorFactory: invalidQuizOutput,
    });
    if (!prompt) throw invalidQuizOutput(`Question ${index + 1} has no prompt.`);
    let choices = Array.isArray(item.choices) ? item.choices.map((value, choiceIndex) => normalizeMathField(value, {
      maxLength: 2000,
      label: `Question ${index + 1} choice ${choiceIndex + 1}`,
      errorFactory: invalidQuizOutput,
    })).filter(Boolean) : [];
    let correctAnswer = normalizeMathField(item.correctAnswer, {
      maxLength: 2000,
      label: `Question ${index + 1} correct answer`,
      errorFactory: invalidQuizOutput,
    });
    if (type === 'TRUE_FALSE') {
      choices = ['True', 'False'];
      correctAnswer = /^true$/i.test(correctAnswer) ? 'True' : /^false$/i.test(correctAnswer) ? 'False' : correctAnswer;
      if (!['True', 'False'].includes(correctAnswer)) throw invalidQuizOutput(`Question ${index + 1} has an invalid True/False answer.`);
    } else {
      if (choices.length !== 4) throw invalidQuizOutput(`Question ${index + 1} must have exactly four choices.`);
      const comparable = choices.map(comparableAnswer);
      if (comparable.some(value => !value) || new Set(comparable).size !== choices.length) throw invalidQuizOutput(`Question ${index + 1} has empty or duplicate choices.`);
      const letter = correctAnswer.match(/^[A-Z]$/i);
      if (letter) correctAnswer = choices[letter[0].toUpperCase().charCodeAt(0) - 65] || correctAnswer;
      const matchingChoice = choices.find(choice => comparableAnswer(choice) === comparableAnswer(correctAnswer));
      if (matchingChoice) correctAnswer = matchingChoice;
      if (!choices.includes(correctAnswer)) throw invalidQuizOutput(`Question ${index + 1} has an answer that is not one of its choices.`);
    }
    const sourceReferences = [...new Set((Array.isArray(item.sourceReferences) ? item.sourceReferences : []).filter(reference => allowedSources.has(reference)))];
    if (!sourceReferences.length) throw invalidQuizOutput(`Question ${index + 1} is not linked to an approved lesson source.`);
    return {
      type,
      topic: normalizeGeneratedText(item.topic, { maxLength: 255 }) || null,
      difficulty: selectedDifficulty,
      prompt,
      choices,
      correctAnswer,
      explanation: normalizeMathField(item.explanation, {
        maxLength: 4000,
        label: `Question ${index + 1} explanation`,
        errorFactory: invalidQuizOutput,
      }),
      sourceReferences, manualGrading: false, maxPoints: 1, problemSettings: {},
    };
  });
  const randomizedQuestions = randomizeMultipleChoiceQuestions(questions);
  return {
    title: professionalQuizTitle(result.title, randomizedQuestions),
    instructions: professionalQuizInstructions(result.instructions, requestedCount),
    questions: randomizedQuestions,
  };
}

async function generateMaterials(lessonId, instructorId) {
  const { context, payload } = await approvedPayload(lessonId, instructorId);
  const result = await geminiInteractive.run(
    () => provider.generateMaterials(payload),
    'AI is temporarily unavailable.'
  );
  const byType = new Map();
  for (const item of result.materials || []) {
    if (MATERIAL_TYPES.includes(item.type) && !byType.has(item.type)) byType.set(item.type, item);
  }
  if (!byType.size) throw new AppError('AI returned no usable lesson sections. Please try again.', 422);
  for (const item of byType.values()) {
    if (!normalizeGeneratedText(item.markdown, { markdown: true }).trim()) {
      throw new AppError('AI returned an empty lesson section. The existing material was kept. Please try again.', 422);
    }
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await lockApprovedContext(client, lessonId, instructorId, context.id);
    await archiveDuplicateMaterials(client, lessonId, instructorId, context.id);
    const existing = await client.query(
      `SELECT * FROM generated_lesson_materials
       WHERE lesson_id=$1 AND instructor_id=$2 AND context_version_id=$3
       ORDER BY removed ASC,
         CASE WHEN EXISTS (
           SELECT 1 FROM generated_material_edits edit
           WHERE edit.generated_material_id=generated_lesson_materials.id
             AND edit.action='REMOVE_SECTION' AND edit.undone_at IS NULL
         ) THEN 0 ELSE 1 END,
         updated_at DESC,generated_at DESC,id DESC
       FOR UPDATE`,
      [lessonId, instructorId, context.id]
    );
    const saved = [];
    let displayOrder = 0;
    for (const [type, item] of byType) {
      const current = existing.rows.find(row => row.material_type === type);
      const values = [
        lessonId, context.id, instructorId, type,
        normalizeGeneratedLessonTitle(item.title),
        JSON.stringify({ markdown: normalizeGeneratedText(item.markdown, { markdown: true }) }),
        JSON.stringify(item.sourceReferences || []),
        GEMINI_REASONING_MODEL,
        displayOrder,
      ];
      const row = current
        ? await client.query(
          `UPDATE generated_lesson_materials
           SET title=$1,content=$2,source_references=$3,provider='GEMINI',provider_version=$4,
               display_order=$5,removed=FALSE,outdated=FALSE,generated_at=NOW(),updated_at=NOW()
           WHERE id=$6 RETURNING *`,
          [values[4], values[5], values[6], values[7], values[8], current.id]
        )
        : await client.query(
          `INSERT INTO generated_lesson_materials(
             lesson_id,context_version_id,instructor_id,material_type,title,content,source_references,
             provider,provider_version,display_order
           ) VALUES($1,$2,$3,$4,$5,$6,$7,'GEMINI',$8,$9) RETURNING *`,
          values
        );
      saved.push(row.rows[0]);
      displayOrder += 1;
    }
    await client.query(
      `UPDATE generated_lesson_materials
       SET removed=TRUE,updated_at=NOW()
       WHERE lesson_id=$1 AND instructor_id=$2 AND context_version_id=$3
         AND removed=FALSE AND NOT (material_type = ANY($4::varchar[]))`,
      [lessonId, instructorId, context.id, [...byType.keys()]]
    );
    await client.query('COMMIT');
    return saved.map(safeMaterial);
  } catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
}

function safeMaterial(row) {
  const content = row.content && typeof row.content === 'object' ? row.content : {};
  return {
    id: row.id, contextVersionId: row.context_version_id, type: row.material_type, title: normalizeGeneratedLessonTitle(row.title), content: { ...content, markdown: normalizeGeneratedText(content.markdown, { markdown: true }) },
    sourceReferences: row.source_references || [], provider: row.provider,
    providerVersion: row.provider_version, outdated: row.outdated, generatedAt: row.generated_at, displayOrder: row.display_order, publishedAt: row.published_at,
  };
}
function safeQuestion(row) {
  return {
    id: row.id, order: row.question_order, type: row.question_type, topic: normalizeGeneratedText(row.topic, { maxLength: 255 }) || null,
    difficulty: row.difficulty, prompt: safeMathField(row.prompt, 10000), choices: (Array.isArray(row.choices) ? row.choices : []).map(value => safeMathField(value, 2000)).filter(Boolean),
    correctAnswer: safeMathField(row.correct_answer, 2000), explanation: safeMathField(row.explanation, 4000),
    sourceReferences: row.source_references || [], manualGrading: row.manual_grading,
    maxPoints: Number(row.max_points ?? 1), problemSettings: row.problem_settings || {},
  };
}
function safeQuiz(row, questions = []) {
  return {
    id: row.id, lessonId: row.lesson_id, title: normalizeGeneratedLessonTitle(row.title), instructions: normalizeGeneratedText(row.instructions, { markdown: true, maxLength: 10000 }), difficulty: row.difficulty,
    status: row.status === 'CLOSED' ? 'DISABLED' : row.status, outdated: row.outdated, publishedAt: row.published_at,
    createdAt: row.created_at, updatedAt: row.updated_at, questions: questions.map(safeQuestion),
  };
}

async function generateQuiz(lessonId, instructorId, options = {}) {
  const { context, payload } = await approvedPayload(lessonId, instructorId);
  const { difficulty, questionCount } = generationOptions(options);
  const specification = quizGenerationSpec(options.prompt || '', questionCount);
  const allowedSources = new Set(payload.map(item => item.source));
  const result = await geminiInteractive.run(
    async ({ attempt }) => normalizeQuiz(
      await quizProvider.generateQuiz(payload, { questionCount, difficulty, specification, repair: attempt > 1 }),
      allowedSources,
      questionCount,
      difficulty,
      specification
    ),
    {
      unavailable: 'Quiz generation could not be completed. Try again.',
      invalidOutput: 'The generated quiz could not be validated. Please try again.',
      rateLimited: 'Quiz generation is temporarily rate-limited. Please try again shortly.',
    },
    { label: 'QuizAI', model: GEMINI_QUIZ_MODEL }
  );
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const quizResult = await client.query(
      `INSERT INTO lesson_quizzes(lesson_id,context_version_id,instructor_id,title,instructions,difficulty,status,provider,provider_version)
       VALUES($1,$2,$3,$4,$5,$6,'DRAFT','GEMINI',$7) RETURNING *`,
      [lessonId, context.id, instructorId, result.title.slice(0, 255), result.instructions, difficulty, GEMINI_QUIZ_MODEL]
    );
    const questions = [];
    for (let index = 0; index < result.questions.length; index += 1) {
      const item = result.questions[index];
      const row = await client.query(
        `INSERT INTO lesson_quiz_questions(quiz_id,question_order,question_type,topic,difficulty,prompt,choices,
          correct_answer,explanation,source_references,manual_grading,max_points,problem_settings)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
        [quizResult.rows[0].id, index + 1, item.type, item.topic, item.difficulty, item.prompt,
         JSON.stringify(item.choices), item.correctAnswer, item.explanation, JSON.stringify(item.sourceReferences), item.manualGrading, item.maxPoints, JSON.stringify(item.problemSettings)]
      );
      questions.push(row.rows[0]);
    }
    await client.query('COMMIT');
    return safeQuiz(quizResult.rows[0], questions);
  } catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
}

async function list(lessonId, instructorId) {
  const context = await contextService.getApprovedForReasoning(lessonId, instructorId);
  const [materials, quizzes, lessonResult] = await Promise.all([
    pool.query(
      `WITH material_context AS (
         SELECT gm.context_version_id FROM generated_lesson_materials gm
         JOIN lesson_context_versions v ON v.id=gm.context_version_id
         WHERE gm.lesson_id=$1 AND gm.instructor_id=$2 AND v.status IN ('APPROVED','ARCHIVED')
         ORDER BY v.version_number DESC,gm.generated_at DESC LIMIT 1
       ) SELECT * FROM (
         SELECT DISTINCT ON (material_type) *
         FROM generated_lesson_materials
         WHERE lesson_id=$1 AND instructor_id=$2 AND context_version_id=(SELECT context_version_id FROM material_context)
         ORDER BY material_type,(context_version_id=$3) DESC,
           CASE
             WHEN context_version_id=$3 AND removed=TRUE AND EXISTS (
               SELECT 1 FROM generated_material_edits edit
               WHERE edit.generated_material_id=generated_lesson_materials.id
                 AND edit.action='REMOVE_SECTION' AND edit.undone_at IS NULL
             ) THEN 0
             WHEN context_version_id=$3 AND removed=FALSE THEN 1
             WHEN context_version_id=$3 THEN 2
             ELSE 3
           END,
           updated_at DESC,generated_at DESC,id DESC
       ) latest
       WHERE removed=FALSE
       ORDER BY COALESCE(display_order,999),generated_at ASC`,
      [lessonId, instructorId, context.id]
    ),
    pool.query('SELECT * FROM lesson_quizzes WHERE lesson_id=$1 AND instructor_id=$2 ORDER BY created_at DESC', [lessonId, instructorId]),
    pool.query(`SELECT l.title,l.started_at,l.ended_at,s.section_name,sub.code subject_code,sub.name subject_name,
      u.first_name||' '||u.last_name instructor_name
      FROM lesson_sessions l JOIN sections s ON s.id=l.section_id JOIN subjects sub ON sub.id=s.subject_id
      JOIN users u ON u.id=l.instructor_id WHERE l.id=$1 AND l.instructor_id=$2`, [lessonId, instructorId]),
  ]);
  const quizItems = [];
  for (const quiz of quizzes.rows) {
    const questions = await pool.query('SELECT * FROM lesson_quiz_questions WHERE quiz_id=$1 ORDER BY question_order', [quiz.id]);
    quizItems.push(safeQuiz(quiz, questions.rows));
  }
  const materialItems = materials.rows.map(row => safeMaterial({ ...row, outdated: row.outdated || row.context_version_id !== context.id }));
  const lesson = lessonResult.rows[0];
  const payload = lesson ? {
    lesson: { title: lesson.title, startedAt: lesson.started_at, endedAt: lesson.ended_at, sectionName: lesson.section_name,
      subjectCode: lesson.subject_code, subjectName: lesson.subject_name, instructorName: lesson.instructor_name },
    materials: materialItems,
  } : null;
  return { materials: materialItems, quizzes: quizItems, approvedContextVersionId: context.id, document: payload ? buildLessonDocument(payload) : null };
}

async function ownedQuiz(quizId, instructorId, client = pool) {
  const { rows } = await client.query('SELECT * FROM lesson_quizzes WHERE id=$1 AND instructor_id=$2', [quizId, instructorId]);
  if (!rows.length) throw new AppError('Quiz not found or access denied.', 404);
  return rows[0];
}
async function ownedEditableQuiz(quizId, instructorId, client = pool) {
  const quiz = await ownedQuiz(quizId, instructorId, client);
  if (!['DRAFT', 'DISABLED'].includes(quiz.status)) throw new AppError('Only a draft or disabled quiz can be edited.', 409);
  return quiz;
}
async function ownedDraftQuiz(quizId, instructorId, client = pool) {
  const quiz = await ownedQuiz(quizId, instructorId, client);
  if (quiz.status !== 'DRAFT') throw new AppError('Only a draft quiz can be published.', 409);
  return quiz;
}

async function updateQuiz(quizId, instructorId, body) {
  await ownedEditableQuiz(quizId, instructorId);
  const { rows } = await pool.query(
    `UPDATE lesson_quizzes SET title=$3,instructions=$4,updated_at=NOW() WHERE id=$1 AND instructor_id=$2 RETURNING *`,
    [quizId, instructorId, normalizeGeneratedText(body.title, { maxLength: 255 }), normalizeGeneratedText(body.instructions, { markdown: true, maxLength: 10000 })]
  );
  return safeQuiz(rows[0]);
}

async function updateQuestion(quizId, questionId, instructorId, body) {
  await ownedEditableQuiz(quizId, instructorId);
  const { rows } = await pool.query('SELECT id FROM lesson_quiz_questions WHERE quiz_id=$1 ORDER BY question_order', [quizId]);
  const index = rows.findIndex(row => row.id === questionId);
  if (index < 0) throw new AppError('Quiz question not found.', 404);
  const result = await applyQuizEdit(quizId, instructorId, {
    operation: 'update_question', targetQuestionNumbers: [index + 1],
    expectedQuestionIds: rows.map(row => row.id), expectedTargetQuestionIds: [questionId], questions: [body],
  });
  return result.questions.find(question => question.id === questionId);
}

function normalizeChatQuizQuestion(body, quizDifficulty, index) {
  const prefix = `Question ${index + 1}`;
  const allowedTypes = ['MULTIPLE_CHOICE','TRUE_FALSE','SHORT_ANSWER','PROBLEM_SOLVING'];
  if (!allowedTypes.includes(body.type)) throw new AppError(`${prefix} has an invalid question type.`, 422);
  const prompt = normalizeMathField(body.prompt, { maxLength: 10000, label: `${prefix} prompt`, errorFactory: message => new AppError(message, 422) });
  const explanation = normalizeMathField(body.explanation, { maxLength: 4000, label: `${prefix} explanation`, errorFactory: message => new AppError(message, 422) });
  let choices = Array.isArray(body.choices) ? body.choices.map((value, choiceIndex) => normalizeMathField(value, {
    maxLength: 2000, label: `${prefix} choice ${choiceIndex + 1}`, errorFactory: message => new AppError(message, 422),
  })).filter(Boolean) : [];
  let correctAnswer = normalizeMathField(body.correctAnswer, { maxLength: 2000, label: `${prefix} correct answer`, errorFactory: message => new AppError(message, 422) });
  if (!prompt) throw new AppError(`${prefix} prompt is required.`, 422);
  if (body.type === 'MULTIPLE_CHOICE') {
    if (choices.length !== 4 || new Set(choices.map(comparableAnswer)).size !== 4) throw new AppError(`${prefix} must have four distinct choices.`, 422);
    const match = choices.find(choice => comparableAnswer(choice) === comparableAnswer(correctAnswer));
    if (!match) throw new AppError(`${prefix} correct answer must match one available choice.`, 422);
    correctAnswer = match;
  } else if (body.type === 'TRUE_FALSE') {
    choices = ['True', 'False'];
    correctAnswer = /^true$/i.test(correctAnswer) ? 'True' : /^false$/i.test(correctAnswer) ? 'False' : '';
    if (!correctAnswer) throw new AppError(`${prefix} requires True or False as its answer.`, 422);
  } else if (body.type === 'PROBLEM_SOLVING') {
    choices = []; correctAnswer = '';
  } else if (!correctAnswer) {
    throw new AppError(`${prefix} requires a model answer.`, 422);
  }
  return {
    type: body.type,
    topic: normalizeGeneratedText(body.topic, { maxLength: 255 }) || null,
    difficulty: quizDifficulty,
    prompt,
    choices,
    correctAnswer,
    explanation,
    manualGrading: ['SHORT_ANSWER', 'PROBLEM_SOLVING'].includes(body.type),
    ...questionSettings(body),
  };
}

async function replaceQuizQuestions(quizId, instructorId, questionBodies) {
  return applyQuizEdit(quizId, instructorId, { operation: 'regenerate_quiz', questions: questionBodies });
}

const QUIZ_PATCH_OPERATIONS = new Set([
  'update_question',
  'update_multiple_questions',
  'add_question',
  'delete_question',
  'reorder_questions',
  'regenerate_quiz',
]);

function sameIdSet(left, right) {
  return left.length === right.length && [...left].sort().every((id, index) => id === [...right].sort()[index]);
}

async function applyQuizEdit(quizId, instructorId, edit = {}) {
  const operation = String(edit.operation || '');
  if (!QUIZ_PATCH_OPERATIONS.has(operation)) throw new AppError('The requested quiz edit operation is invalid.', 422);
  const targetNumbers = [...new Set((edit.targetQuestionNumbers || []).map(Number))];
  const questionBodies = Array.isArray(edit.questions) ? edit.questions : [];
  const expectedQuestionIds = Array.isArray(edit.expectedQuestionIds) ? edit.expectedQuestionIds : [];
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const quiz = await ownedEditableQuiz(quizId, instructorId, client);
    const existingResult = await client.query(
      'SELECT * FROM lesson_quiz_questions WHERE quiz_id=$1 ORDER BY question_order FOR UPDATE',
      [quizId]
    );
    const existing = existingResult.rows;
    const originalIds = existing.map(row => row.id);
    if (expectedQuestionIds.length && !sameIdSet(originalIds, expectedQuestionIds)) {
      throw new AppError('The quiz changed while the AI edit was being prepared. Review the latest draft and try again.', 409);
    }

    const resolveTargets = ({ exactCount, minimumCount = exactCount } = {}) => {
      if (exactCount != null && targetNumbers.length !== exactCount) throw new AppError('The AI edit did not identify the expected question target.', 422);
      if (minimumCount != null && targetNumbers.length < minimumCount) throw new AppError('The AI edit did not identify a question target.', 422);
      if (targetNumbers.some(number => !Number.isInteger(number) || number < 1 || number > existing.length)) {
        throw new AppError('The requested quiz question does not exist.', 422);
      }
      return targetNumbers.map(number => existing[number - 1]);
    };
    const updateExisting = async (row, body, questionIndex) => {
      if (row.question_type === 'PROBLEM_SOLVING' || body.type === 'PROBLEM_SOLVING') {
        const attempts = await client.query('SELECT 1 FROM quiz_attempts WHERE quiz_id=$1 LIMIT 1', [quizId]);
        if (attempts.rowCount) throw new AppError('Problem-solving questions cannot change after students start this quiz. Create a new draft instead.', 409);
      }
      const normalized = normalizeChatQuizQuestion({
        ...body, maxPoints: body.maxPoints ?? row.max_points,
        problemSettings: body.problemSettings ?? row.problem_settings,
      }, quiz.difficulty, questionIndex);
      const result = await client.query(
        `UPDATE lesson_quiz_questions
         SET question_type=$3,topic=$4,difficulty=$5,prompt=$6,choices=$7,
             correct_answer=$8,explanation=$9,manual_grading=$10,max_points=$11,problem_settings=$12,updated_at=NOW()
         WHERE id=$1 AND quiz_id=$2 RETURNING *`,
        [row.id, quizId, normalized.type, normalized.topic, normalized.difficulty, normalized.prompt,
         JSON.stringify(normalized.choices), normalized.correctAnswer, normalized.explanation, normalized.manualGrading, normalized.maxPoints, JSON.stringify(normalized.problemSettings)]
      );
      if (result.rowCount !== 1) throw new AppError('The targeted quiz question could not be updated.', 409);
    };

    if (operation === 'update_question' || operation === 'update_multiple_questions') {
      const targets = resolveTargets(operation === 'update_question' ? { exactCount: 1 } : { minimumCount: 2 });
      if (edit.expectedTargetQuestionIds?.length
        && !targets.every((row, index) => row.id === edit.expectedTargetQuestionIds[index])) {
        throw new AppError('The target question order changed while the AI edit was being prepared. No questions were changed.', 409);
      }
      if (questionBodies.length !== targets.length) throw new AppError('The AI edit returned an unexpected number of question patches.', 422);
      for (let index = 0; index < targets.length; index += 1) {
        await updateExisting(targets[index], questionBodies[index], targetNumbers[index] - 1);
      }
    } else if (operation === 'add_question') {
      if (existing.length >= 20) throw new AppError('A draft quiz cannot contain more than 20 questions.', 422);
      if (questionBodies.length !== 1) throw new AppError('The AI edit must return exactly one new question.', 422);
      const normalized = normalizeChatQuizQuestion(questionBodies[0], quiz.difficulty, existing.length);
      await client.query(
        `INSERT INTO lesson_quiz_questions(
           quiz_id,question_order,question_type,topic,difficulty,prompt,choices,
           correct_answer,explanation,source_references,manual_grading,max_points,problem_settings
         ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,'[]'::jsonb,$10,$11,$12)`,
        [quizId, existing.length + 1, normalized.type, normalized.topic, normalized.difficulty,
         normalized.prompt, JSON.stringify(normalized.choices), normalized.correctAnswer,
         normalized.explanation, normalized.manualGrading, normalized.maxPoints, JSON.stringify(normalized.problemSettings)]
      );
    } else if (operation === 'delete_question') {
      if (existing.length <= 1) throw new AppError('The final quiz question cannot be deleted.', 422);
      const [target] = resolveTargets({ exactCount: 1 });
      await client.query('DELETE FROM lesson_quiz_questions WHERE id=$1 AND quiz_id=$2', [target.id, quizId]);
      const remaining = existing.filter(row => row.id !== target.id);
      for (let index = 0; index < remaining.length; index += 1) {
        await client.query('UPDATE lesson_quiz_questions SET question_order=$2 WHERE id=$1', [remaining[index].id, index + 1]);
      }
    } else if (operation === 'reorder_questions') {
      const order = (edit.order || []).map(Number);
      if (order.length !== existing.length || new Set(order).size !== existing.length
        || order.some(number => !Number.isInteger(number) || number < 1 || number > existing.length)) {
        throw new AppError('The AI edit returned an invalid quiz order.', 422);
      }
      await client.query('UPDATE lesson_quiz_questions SET question_order=question_order+1000 WHERE quiz_id=$1', [quizId]);
      for (let index = 0; index < order.length; index += 1) {
        await client.query(
          'UPDATE lesson_quiz_questions SET question_order=$2,updated_at=NOW() WHERE id=$1 AND quiz_id=$3',
          [existing[order[index] - 1].id, index + 1, quizId]
        );
      }
    } else if (operation === 'regenerate_quiz') {
      const attempts = await client.query('SELECT 1 FROM quiz_attempts WHERE quiz_id=$1 LIMIT 1', [quizId]);
      if (attempts.rowCount) throw new AppError('A quiz with student attempts cannot be regenerated. Create a new draft instead.', 409);
      if (questionBodies.length < 1 || questionBodies.length > 20) throw new AppError('A regenerated quiz must contain 1 to 20 questions.', 422);
      if (edit.requestedQuestionCount && questionBodies.length !== Number(edit.requestedQuestionCount)) {
        throw new AppError('The regenerated quiz did not contain the requested number of questions.', 422);
      }
      const normalized = questionBodies.map((body, index) => normalizeChatQuizQuestion(body, quiz.difficulty, index));
      for (let index = 0; index < normalized.length; index += 1) {
        const question = normalized[index];
        const current = existing[index];
        const values = [quizId, index + 1, question.type, question.topic, question.difficulty, question.prompt,
          JSON.stringify(question.choices), question.correctAnswer, question.explanation, question.manualGrading, question.maxPoints, JSON.stringify(question.problemSettings)];
        if (current) {
          await client.query(
            `UPDATE lesson_quiz_questions
             SET question_order=$2,question_type=$3,topic=$4,difficulty=$5,prompt=$6,choices=$7,
                 correct_answer=$8,explanation=$9,manual_grading=$10,max_points=$11,problem_settings=$12,updated_at=NOW()
             WHERE id=$13 AND quiz_id=$1`,
            [...values, current.id]
          );
        } else {
          await client.query(
            `INSERT INTO lesson_quiz_questions(
               quiz_id,question_order,question_type,topic,difficulty,prompt,choices,
               correct_answer,explanation,source_references,manual_grading,max_points,problem_settings
             ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,'[]'::jsonb,$10,$11,$12)`,
            values
          );
        }
      }
      const removedIds = existing.slice(normalized.length).map(row => row.id);
      if (removedIds.length) {
        await client.query('DELETE FROM lesson_quiz_questions WHERE quiz_id=$1 AND id=ANY($2::uuid[])', [quizId, removedIds]);
      }
    }

    const finalResult = await client.query(
      'SELECT * FROM lesson_quiz_questions WHERE quiz_id=$1 ORDER BY question_order',
      [quizId]
    );
    const finalIds = finalResult.rows.map(row => row.id);
    if (['update_question', 'update_multiple_questions', 'reorder_questions'].includes(operation)
      && (finalResult.rows.length !== existing.length || !sameIdSet(finalIds, originalIds))) {
      throw new AppError('The targeted quiz edit changed unrelated questions. The original quiz was preserved.', 409);
    }
    if (operation === 'add_question'
      && (finalResult.rows.length !== existing.length + 1 || !originalIds.every(id => finalIds.includes(id)))) {
      throw new AppError('The quiz question could not be added safely.', 409);
    }
    if (operation === 'delete_question') {
      const deletedId = existing[targetNumbers[0] - 1]?.id;
      if (finalResult.rows.length !== existing.length - 1 || finalIds.includes(deletedId)
        || originalIds.filter(id => id !== deletedId).some(id => !finalIds.includes(id))) {
        throw new AppError('The quiz question could not be deleted safely.', 409);
      }
    }
    const updatedQuiz = await client.query(
      'UPDATE lesson_quizzes SET updated_at=NOW() WHERE id=$1 AND instructor_id=$2 RETURNING *',
      [quizId, instructorId]
    );
    await client.query('COMMIT');
    return safeQuiz(updatedQuiz.rows[0], finalResult.rows);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function deleteQuestion(quizId, questionId, instructorId) {
  await ownedEditableQuiz(quizId, instructorId);
  const result = await pool.query(
    `DELETE FROM lesson_quiz_questions WHERE id=$1 AND quiz_id=$2
     AND EXISTS(SELECT 1 FROM lesson_quizzes WHERE id=$2 AND instructor_id=$3)`, [questionId, quizId, instructorId]
  );
  if (!result.rowCount) throw new AppError('Quiz question not found.', 404);
}

async function closeQuiz(quizId, instructorId) {
  const { rows } = await pool.query(
    `UPDATE lesson_quizzes SET status='DISABLED',closed_at=NOW(),updated_at=NOW()
     WHERE id=$1 AND instructor_id=$2 AND status='PUBLISHED' RETURNING *`, [quizId, instructorId]
  );
  if (!rows.length) throw new AppError('Only a published quiz can be disabled.', 409);
  const questions = await pool.query('SELECT * FROM lesson_quiz_questions WHERE quiz_id=$1 ORDER BY question_order', [quizId]);
  return safeQuiz(rows[0], questions.rows);
}

async function setQuizStatus(quizId, instructorId, nextStatus) {
  if (!['PUBLISHED', 'DISABLED'].includes(nextStatus)) throw new AppError('Quiz status must be PUBLISHED or DISABLED.', 400);
  const expectedStatus = nextStatus === 'DISABLED' ? 'PUBLISHED' : 'DISABLED';
  const { rows } = await pool.query(
    `UPDATE lesson_quizzes
     SET status=$3,
         closed_at=CASE WHEN $3='DISABLED' THEN NOW() ELSE NULL END,
         published_at=COALESCE(published_at,NOW()),
         updated_at=NOW()
     WHERE id=$1 AND instructor_id=$2 AND status=$4
     RETURNING *`,
    [quizId, instructorId, nextStatus, expectedStatus]
  );
  if (!rows.length) {
    const owned = await pool.query('SELECT status FROM lesson_quizzes WHERE id=$1 AND instructor_id=$2', [quizId, instructorId]);
    if (!owned.rows.length) throw new AppError('Quiz not found or access denied.', 404);
    throw new AppError(`Only a ${expectedStatus.toLowerCase()} quiz can be ${nextStatus === 'DISABLED' ? 'disabled' : 'enabled'}.`, 409);
  }
  const questions = await pool.query('SELECT * FROM lesson_quiz_questions WHERE quiz_id=$1 ORDER BY question_order', [quizId]);
  return safeQuiz(rows[0], questions.rows);
}

async function deleteQuiz(quizId, instructorId, options = {}) {
  const force = options.force === true;
  console.info('[QuizDelete] Request received');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const found = await client.query('SELECT id,instructor_id,title,status FROM lesson_quizzes WHERE id=$1 FOR UPDATE', [quizId]);
    console.info(`[QuizDelete] Quiz found: ${found.rows.length ? 'YES' : 'NO'}`);
    const authorized = Boolean(found.rows.length && found.rows[0].instructor_id === instructorId);
    console.info(`[QuizDelete] Authorized: ${authorized ? 'YES' : 'NO'}`);
    if (!authorized) throw new AppError('Quiz not found or access denied.', 404);
    const attempts = await client.query('SELECT COUNT(*)::int AS count FROM quiz_attempts WHERE quiz_id=$1', [quizId]);
    const hasAttempts = attempts.rows[0].count > 0;
    console.info(`[QuizDelete] Has attempts: ${hasAttempts ? 'YES' : 'NO'}`);
    console.info(`[QuizDelete] Strategy: ${hasAttempts ? force ? 'FORCE_DELETE' : 'BLOCK' : 'HARD_DELETE'}`);
    if (hasAttempts && !force) {
      throw new AppError(
        'This quiz has student attempts. Force deletion requires separate confirmation.',
        409,
        { code: 'QUIZ_HAS_ATTEMPTS', details: { attemptCount: attempts.rows[0].count } }
      );
    }
    if (hasAttempts) {
      await client.query(
        `DELETE FROM quiz_attempt_answers
         WHERE attempt_id IN (SELECT id FROM quiz_attempts WHERE quiz_id=$1)`,
        [quizId]
      );
      await client.query('DELETE FROM quiz_attempts WHERE quiz_id=$1', [quizId]);
    }
    const removed = await client.query('DELETE FROM lesson_quizzes WHERE id=$1 AND instructor_id=$2 RETURNING id', [quizId, instructorId]);
    if (removed.rowCount !== 1) throw new AppError('Quiz deletion could not be completed. Please try again.', 409);
    console.info('[QuizDelete] DB mutation completed: YES');
    await client.query('COMMIT');
    return {
      id: quizId,
      deleted: true,
      forceDeleted: hasAttempts && force,
      attemptsRemoved: hasAttempts ? attempts.rows[0].count : 0,
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function publishMaterials(lessonId, instructorId) {
  const context = await contextService.getApprovedForReasoning(lessonId, instructorId);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await lockApprovedContext(client, lessonId, instructorId, context.id);
    await archiveDuplicateMaterials(client, lessonId, instructorId, context.id);
    const active = await client.query(
      `SELECT * FROM generated_lesson_materials
       WHERE lesson_id=$1 AND instructor_id=$2 AND context_version_id=$3
         AND removed=FALSE
       ORDER BY COALESCE(display_order,999),generated_at,id FOR UPDATE`,
      [lessonId, instructorId, context.id]
    );
    if (!active.rows.length || active.rows.some(row => row.outdated)) {
      throw new AppError('Regenerate lesson materials from the latest approved context before publishing. Existing published material has been kept.', 409);
    }

    await client.query(
      `UPDATE generated_lesson_materials
       SET published_at=NULL,published_snapshot=NULL,updated_at=NOW()
       WHERE lesson_id=$1 AND instructor_id=$2 AND context_version_id=$3`,
      [lessonId, instructorId, context.id]
    );
    const published = await client.query(
      `UPDATE generated_lesson_materials
       SET published_at=NOW(),
           published_snapshot=jsonb_build_object(
             'title',title,
             'content',content,
             'sourceReferences',source_references,
             'displayOrder',display_order,
             'generatedAt',generated_at
           ),
           updated_at=NOW()
       WHERE id = ANY($1::uuid[])
       RETURNING *`,
      [active.rows.map(row => row.id)]
    );
    await client.query('COMMIT');
    return published.rows.sort((a,b)=>(a.display_order??999)-(b.display_order??999)).map(safeMaterial);
  } catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
}

async function publishQuiz(quizId, instructorId) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await ownedDraftQuiz(quizId, instructorId, client);
    const questions = await client.query(
      'SELECT * FROM lesson_quiz_questions WHERE quiz_id=$1 ORDER BY question_order FOR UPDATE',
      [quizId]
    );
    if (!questions.rows.length) throw new AppError('Add at least one question before publishing.', 409);

    const normalizedQuestions = [];
    for (let index = 0; index < questions.rows.length; index += 1) {
      const question = questions.rows[index];
      const normalized = normalizePersistedQuestion(question, index);
      const updated = await client.query(
        `UPDATE lesson_quiz_questions
         SET prompt=$2,choices=$3,correct_answer=$4,explanation=$5,updated_at=NOW()
         WHERE id=$1 RETURNING *`,
        [question.id, normalized.prompt, JSON.stringify(normalized.choices), normalized.correctAnswer, normalized.explanation]
      );
      normalizedQuestions.push(updated.rows[0]);
    }

    const { rows } = await client.query(
      `UPDATE lesson_quizzes SET status='PUBLISHED',published_at=NOW(),updated_at=NOW()
       WHERE id=$1 AND instructor_id=$2 RETURNING *`,
      [quizId, instructorId]
    );
    await client.query('COMMIT');
    return safeQuiz(rows[0], normalizedQuestions);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

module.exports = { generateMaterials, publishMaterials, generateQuiz, list, updateQuiz, updateQuestion, replaceQuizQuestions, applyQuizEdit, deleteQuestion, publishQuiz, closeQuiz, setQuizStatus, deleteQuiz, archiveDuplicateMaterials, materialRevision };
