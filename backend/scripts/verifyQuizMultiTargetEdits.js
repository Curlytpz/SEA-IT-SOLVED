const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const vm = require('node:vm');
require('../src/config/env');
const pool = require('../src/db/pool');
const chat = require('../src/services/lesson-chat.service');
const intelligence = require('../src/services/lesson-intelligence.service');
const interactive = require('../src/services/geminiInteractive.service');
const Provider = require('../src/reasoning/GeminiLessonChatProvider');
const targeting = require('../../shared/quizEditTargeting.cjs');

async function main() {
  const browserScope = {};
  vm.runInNewContext(fs.readFileSync(require.resolve('../../shared/quizEditTargeting.cjs'), 'utf8'), browserScope);
  const browserIntent = vm.runInNewContext("globalThis[Symbol.for('sea-it-solved.quizEditTargeting')].quizEditIntent", browserScope);
  const cases = [
    ['make question number 1 and 2 harder', [1, 2]],
    ['make questions 2 and 4 easier', [2, 4]],
    ['change question 1, 3 and 5 to multiple choice', [1, 3, 5]],
    ['make the first and last question harder', [1, 5]],
    ['make the last two questions easier', [4, 5]],
    ['make the last 2 questions easier', [4, 5]],
    ['make question 1 and question 2 harder', [1, 2]],
    ['make the second to last question harder', [4]],
  ];
  for (const [message, targets] of cases) {
    assert.deepEqual(targeting.quizEditPlan(message, { questionCount: 5 }).targetQuestionNumbers, targets);
    assert.equal(targeting.quizEditIntent(message), true);
    assert.equal(browserIntent(message), true, 'Frontend must choose quiz edit before generation.');
  }
  for (const message of ['what about question number 2?', 'do question 2 too', 'also make number 2 harder', 'you forgot the second question', 'make them multiple choice too']) {
    assert.equal(targeting.quizEditIntent(message), true);
    assert.equal(browserIntent(message), true);
  }
  for (const message of ['Generate a quiz about this lesson.', 'Generate 5 easy quiz questions.', 'Explain question 2.', 'Summarize this lesson.']) {
    assert.equal(targeting.quizEditIntent(message), false);
    assert.equal(browserIntent(message), false);
  }
  assert.equal(targeting.quizEditPlan('regenerate the whole quiz').operation, 'regenerate_quiz');
  assert.equal(targeting.quizEditPlan('add another question').operation, 'add_question');
  assert.equal(targeting.quizEditPlan('delete question 2').operation, 'delete_question');
  console.log('SHARED FRONTEND/BACKEND MULTI-QUESTION INTENT: PASS');

  const ids = { user: null, subject: null, section: null, lesson: null, context: null, quiz: null };
  const originalRequest = Provider.prototype.request;
  const originalRun = interactive.run;
  let responseMode = 'valid', calls = 0;
  let seenPlan, seenQuiz;
  // Exercise the real provider prompt builder, service dispatcher, DB patches, and metadata;
  // replace only network I/O so tests are deterministic and consume no Gemini quota.
  interactive.run = operation => operation();
  Provider.prototype.request = async function (text, schema, system) {
    assert.match(system, /never ask the instructor to paste it again/);
    assert(schema.properties.operation.enum.includes('update_multiple_questions'));
    seenPlan = JSON.parse(text.split('SERVER EDIT PLAN:\n')[1].split('\n\nQUIZ EDIT INSTRUCTION:')[0]);
    const quizzes = JSON.parse(text.split('CURRENT DRAFT QUIZZES IN DISPLAY ORDER:\n')[1].split('\n\nRECENT CONVERSATION:')[0]);
    seenQuiz = quizzes.find(quiz => quiz.quizNumber === seenPlan.quizNumber);
    assert(seenQuiz && seenQuiz.questions.length === 5, 'Canonical questions must reach the provider.');
    assert.match(text, /RECENT CONVERSATION:\n\[\]/, 'Targeted edits must not receive stale free-form instructions.');
    assert(['update_question', 'update_multiple_questions'].includes(seenPlan.operation), 'Never regenerate for targeted edits.');
    calls += 1;
    const questions = seenPlan.targetQuestionNumbers.map(number => {
      const current = seenQuiz.questions[number - 1];
      assert(current, 'All targets must exist before provider invocation.');
      const type = { multiple_choice: 'MULTIPLE_CHOICE', true_false: 'TRUE_FALSE' }[seenPlan.requestedChange] || current.type;
      return {
        type, topic: current.topic,
        prompt: `Edited ${calls} question ${number}: ${seenPlan.requestedChange} verification.`,
        choices: type === 'MULTIPLE_CHOICE' ? ['0', '1', '2', '3'] : ['True', 'False'],
        correctAnswer: type === 'MULTIPLE_CHOICE' ? '1' : 'True',
        explanation: `Explanation for edit ${calls} question ${number}.`,
      };
    });
    if (responseMode === 'malformed') questions[questions.length - 1].prompt = '';
    if (responseMode === 'stale-type') questions[0].type = questions[0].type === 'TRUE_FALSE' ? 'MULTIPLE_CHOICE' : 'TRUE_FALSE';
    if (responseMode === 'partial') questions.pop();
    return { action: 'UPDATE_QUIZ', operation: seenPlan.operation, quizNumber: seenPlan.quizNumber,
      targetQuestionNumbers: seenPlan.targetQuestionNumbers, order: [], questions,
      message: 'Question 1 was updated to multiple choice.' }; // Deliberately wrong; must never become the confirmation.
  };

  const rows = async () => (await pool.query('SELECT * FROM lesson_quiz_questions WHERE quiz_id=$1 ORDER BY question_order', [ids.quiz])).rows;
  const metadata = async () => (await pool.query("SELECT metadata FROM lesson_chat_messages WHERE lesson_id=$1 AND role='ASSISTANT' AND metadata->>'action'='QUIZ_EDITED' ORDER BY created_at DESC,id DESC LIMIT 1", [ids.lesson])).rows[0].metadata;
  const messagesCount = async () => Number((await pool.query('SELECT COUNT(*)::int count FROM lesson_chat_messages WHERE lesson_id=$1', [ids.lesson])).rows[0].count);
  async function edit(message, targets, requestedChange, extra = {}) {
    const before = await rows();
    const response = await chat.send(ids.lesson, ids.user, { message, ...extra });
    assert.equal(response.quizEdited, true);
    assert.equal(response.requiresQuizOptions, undefined);
    assert.equal(response.quiz.id, ids.quiz);
    assert.equal(response.quiz.questions.length, 5);
    assert.deepEqual(seenPlan.targetQuestionNumbers, targets);
    assert.equal(seenPlan.requestedChange, requestedChange);
    const after = await rows();
    assert.deepEqual(after.map(row => row.id), before.map(row => row.id));
    for (let index = 0; index < 5; index += 1) {
      if (targets.includes(index + 1)) assert.notEqual(after[index].prompt, before[index].prompt);
      else assert.deepEqual(after[index], before[index], 'Untouched rows, including all fields and timestamps, must remain identical.');
    }
    const committed = await metadata();
    assert.deepEqual(committed.targetQuestionNumbers, targets);
    assert.deepEqual(committed.targetQuestionIds, targets.map(number => before[number - 1].id));
    assert.equal(committed.quizId, ids.quiz);
    assert.equal(committed.operation, targets.length > 1 ? 'update_multiple_questions' : 'update_question');
    assert.equal(committed.requestedChange, requestedChange);
    assert.doesNotMatch(response.message.content, /paste|provide.*content/i);
    return response;
  }

  try {
    const suffix = crypto.randomBytes(6).toString('hex');
    ids.user = (await pool.query("INSERT INTO users(first_name,last_name,email,password_hash,role,status) VALUES('Quiz Target','Verification',$1,'verification-only','INSTRUCTOR','ACTIVE') RETURNING id", [`quiz-target-${suffix}@hau.edu.ph`])).rows[0].id;
    ids.subject = (await pool.query("INSERT INTO subjects(code,name) VALUES($1,'Target verification') RETURNING id", [`QT${suffix}`])).rows[0].id;
    ids.section = (await pool.query("INSERT INTO sections(subject_id,instructor_id,section_name,join_code) VALUES($1,$2,'Verification',$3) RETURNING id", [ids.subject, ids.user, suffix.toUpperCase()])).rows[0].id;
    ids.lesson = (await pool.query("INSERT INTO lesson_sessions(section_id,instructor_id,title) VALUES($1,$2,'Quiz target verification') RETURNING id", [ids.section, ids.user])).rows[0].id;
    ids.context = (await pool.query("INSERT INTO lesson_context_versions(lesson_id,section_id,instructor_id,version_number,status,approved_at) VALUES($1,$2,$3,1,'APPROVED',NOW()) RETURNING id", [ids.lesson, ids.section, ids.user])).rows[0].id;
    ids.quiz = (await pool.query("INSERT INTO lesson_quizzes(lesson_id,context_version_id,instructor_id,title,instructions,difficulty,status,provider,provider_version) VALUES($1,$2,$3,'Canonical five question quiz','Answer all questions.','MEDIUM','DRAFT','TEST','multi-target-verification') RETURNING id", [ids.lesson, ids.context, ids.user])).rows[0].id;
    for (let number = 1; number <= 5; number += 1) {
      await pool.query("INSERT INTO lesson_quiz_questions(quiz_id,question_order,question_type,topic,difficulty,prompt,choices,correct_answer,explanation,source_references,manual_grading) VALUES($1,$2,'TRUE_FALSE','Verification','MEDIUM',$3,$4,'True','Original explanation.','[]'::jsonb,FALSE)", [ids.quiz, number, `Original question ${number} is true.`, JSON.stringify(['True', 'False'])]);
    }

    // A current difficulty request must override a previous type-conversion request.
    await edit('make question 1 multiple choice', [1], 'multiple_choice');
    const a = await edit('can you make question number 1 and 2 harder', [1, 2], 'harder', { intent: 'GENERATE_QUIZ' });
    assert.equal(a.message.content, 'Questions 1 and 2 were made more challenging. The other 3 questions were left unchanged.');
    const d = await edit('make them multiple choice too', [1, 2], 'multiple_choice');
    assert.equal(d.message.content, 'Questions 1 and 2 were updated to multiple choice. The other 3 questions were left unchanged.');
    await edit('make questions 2 and 4 easier', [2, 4], 'easier');
    await edit('make the first and last question harder', [1, 5], 'harder');
    await edit('make the last two questions easier', [4, 5], 'easier');
    await edit('make questions 1 and 2 harder', [1, 2], 'harder');
    for (const followup of ['what about question number 2?', 'do question 2 too', 'also make number 2 harder', 'you forgot the second question']) {
      const result = await edit(followup, [2], 'harder');
      assert.equal(result.message.content, 'Question 2 was made more challenging. The other 4 questions were left unchanged.');
    }
    await edit('make the last question harder', [5], 'harder');
    await edit('make it harder', [5], 'harder');

    const beforeFailure = await rows();
    const priorMetadata = await metadata(), priorMessages = await messagesCount();
    for (const mode of ['malformed', 'partial', 'stale-type']) {
      responseMode = mode;
      await assert.rejects(() => chat.send(ids.lesson, ids.user, { message: 'make questions 1 and 2 harder' }), error => error.statusCode === 422);
      assert.deepEqual(await rows(), beforeFailure, 'Any invalid target patch must preserve the whole quiz.');
      assert.deepEqual(await metadata(), priorMetadata);
      assert.equal(await messagesCount(), priorMessages, 'Never record a successful edit or confirmation after failure.');
    }
    responseMode = 'valid';
    const beforeInvalidTargets = calls;
    await assert.rejects(() => chat.send(ids.lesson, ids.user, { message: 'make questions 1 and 9 harder' }), error => error.statusCode === 422);
    assert.equal(calls, beforeInvalidTargets, 'Invalid targets must fail before the provider call.');
    assert.deepEqual(await rows(), beforeFailure);

    // A concurrent reorder must not silently retarget a resolved multi-edit.
    await assert.rejects(() => intelligence.applyQuizEdit(ids.quiz, ids.user, {
      operation: 'update_multiple_questions', targetQuestionNumbers: [1, 2], questions: [],
      expectedQuestionIds: beforeFailure.map(row => row.id),
      expectedTargetQuestionIds: [beforeFailure[1].id, beforeFailure[0].id],
    }), error => error.statusCode === 409);
    assert.deepEqual(await rows(), beforeFailure);
    const refreshed = await intelligence.list(ids.lesson, ids.user);
    assert.equal(refreshed.quizzes.find(quiz => quiz.id === ids.quiz).questions.length, 5);
    console.log('A Q1 AND Q2 HARDER / FRESH CHANGE PLAN: PASS');
    console.log('B Q2 AND Q4 EASIER: PASS');
    console.log('C FIRST + LAST / LAST TWO: PASS');
    console.log('D FOLLOW-UP THEM / SAVED TARGET IDS: PASS');
    console.log('E CANONICAL QUESTION LOOKUP / NO RE-PASTE: PASS');
    console.log('F COMMITTED COMPLETION MESSAGE: PASS');
    console.log('G MULTI-QUESTION TRANSACTION ROLLBACK: PASS');
    console.log('SINGLE-QUESTION / LAST / IT REGRESSION: PASS');
    console.log('QUESTION COUNT / UNTOUCHED ROWS / RELOAD: PASS');
    console.log('PARTIAL OUTPUT / STALE TYPE / INVALID TARGET / REORDER GUARDS: PASS');
  } finally {
    Provider.prototype.request = originalRequest;
    interactive.run = originalRun;
    if (ids.quiz) await pool.query('DELETE FROM lesson_quizzes WHERE id=$1', [ids.quiz]);
    if (ids.lesson) await pool.query('DELETE FROM lesson_sessions WHERE id=$1', [ids.lesson]);
    if (ids.section) await pool.query('DELETE FROM sections WHERE id=$1', [ids.section]);
    if (ids.subject) await pool.query('DELETE FROM subjects WHERE id=$1', [ids.subject]);
    if (ids.user) await pool.query('DELETE FROM users WHERE id=$1', [ids.user]);
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => pool.end());
