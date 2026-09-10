const assert = require('node:assert/strict');
require('../src/config/env');
const pool = require('../src/db/pool');
const intelligence = require('../src/services/lesson-intelligence.service');
const chat = require('../src/services/lesson-chat.service');
const { quizEditIntent } = require('../src/utils/lessonChatIntent');

const mc = label => ({
  type: 'MULTIPLE_CHOICE',
  topic: 'Verification',
  prompt: `${label}: choose the correct value.`,
  choices: ['0', '1', '2', '3'],
  correctAnswer: '1',
  explanation: 'The correct value is 1.',
});

const tf = label => ({
  type: 'TRUE_FALSE',
  topic: 'Verification',
  prompt: `${label} is true.`,
  choices: ['True', 'False'],
  correctAnswer: 'True',
  explanation: 'This statement is true.',
});

async function fixture(context) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const quiz = await client.query(
      `INSERT INTO lesson_quizzes(
         lesson_id,context_version_id,instructor_id,title,instructions,difficulty,status,provider,provider_version
       ) VALUES($1,$2,$3,$4,'Answer all questions.','MEDIUM','DRAFT','TEST','targeted-edit-verification')
       RETURNING *`,
      [context.lesson_id, context.context_id, context.instructor_id, `Targeted edit verification ${Date.now()}`]
    );
    const questions = [];
    for (let index = 0; index < 5; index += 1) {
      const body = tf(`Original question ${index + 1}`);
      const saved = await client.query(
        `INSERT INTO lesson_quiz_questions(
           quiz_id,question_order,question_type,topic,difficulty,prompt,choices,
           correct_answer,explanation,source_references,manual_grading
         ) VALUES($1,$2,$3,$4,'MEDIUM',$5,$6,$7,$8,'[]'::jsonb,FALSE) RETURNING *`,
        [quiz.rows[0].id, index + 1, body.type, body.topic, body.prompt,
         JSON.stringify(body.choices), body.correctAnswer, body.explanation]
      );
      questions.push(saved.rows[0]);
    }
    await client.query('COMMIT');
    return { quiz: quiz.rows[0], questionIds: questions.map(question => question.id) };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function removeFixture(item, instructorId) {
  if (item?.quiz?.id) await intelligence.deleteQuiz(item.quiz.id, instructorId);
}

async function main() {
  const eligible = await pool.query(
    `SELECT version.id context_id,version.lesson_id,version.instructor_id
     FROM lesson_context_versions version
     JOIN users instructor ON instructor.id=version.instructor_id
     WHERE version.status='APPROVED' AND instructor.role='INSTRUCTOR' AND instructor.status='ACTIVE'
     ORDER BY version.approved_at DESC NULLS LAST,version.updated_at DESC LIMIT 1`
  );
  if (!eligible.rows.length) throw new Error('No approved lesson is available for targeted quiz-edit verification.');
  const context = eligible.rows[0];
  let createdMessageIds = [];

  assert.equal(chat.quizEditPlan('edit question number 1 make it a multiple choice answer').operation, 'update_question');
  assert.deepEqual(chat.quizEditPlan('make question 3 harder').targetQuestionNumbers, [3]);
  assert.deepEqual(chat.quizEditPlan('make the first question harder', { questionCount: 5 }).targetQuestionNumbers, [1]);
  assert.deepEqual(chat.quizEditPlan('make the last question harder', { questionCount: 5 }).targetQuestionNumbers, [5]);
  assert.deepEqual(chat.quizEditPlan('make the second to last question harder', { questionCount: 5 }).targetQuestionNumbers, [4]);
  assert.deepEqual(chat.quizEditPlan('make it harder', { questionCount: 5, recentQuestionNumber: 5 }).targetQuestionNumbers, [5]);
  assert.equal(chat.quizEditPlan('make the last question harder', { questionCount: 5 }).operation, 'update_question');
  assert.equal(chat.quizEditPlan('make it harder', { questionCount: 5, recentQuestionNumber: 5 }).operation, 'update_question');
  assert.equal(quizEditIntent('make the last question harder'), true);
  assert.equal(quizEditIntent('make it harder'), true);
  assert.equal(chat.quizEditPlan('delete question 2').operation, 'delete_question');
  assert.equal(chat.quizEditPlan('add another question').operation, 'add_question');
  assert.equal(chat.quizEditPlan('regenerate the whole quiz').operation, 'regenerate_quiz');

  let item;
  try {
    item = await fixture(context);
    const beforeMessages = await pool.query(
      'SELECT id FROM lesson_chat_messages WHERE lesson_id=$1 AND instructor_id=$2',
      [context.lesson_id, context.instructor_id]
    );
    const beforeMessageIds = new Set(beforeMessages.rows.map(row => row.id));
    const response = await chat.send(context.lesson_id, context.instructor_id, {
      message: 'make the last question harder',
    });
    const baseline = response.quiz;
    const followupResponse = await chat.send(context.lesson_id, context.instructor_id, {
      message: 'make it harder',
    });
    const followup = followupResponse.quiz;
    const afterMessages = await pool.query(
      'SELECT id FROM lesson_chat_messages WHERE lesson_id=$1 AND instructor_id=$2',
      [context.lesson_id, context.instructor_id]
    );
    createdMessageIds = afterMessages.rows.map(row => row.id).filter(id => !beforeMessageIds.has(id));
    assert.equal(baseline.questions.length, 5);
    assert.deepEqual(baseline.questions.map(question => question.id), item.questionIds);
    assert.match(response.message.content, /Question 5 was updated/i);
    assert.match(response.message.content, /other 4 questions were left unchanged/i);
    assert.equal(followup.questions.length, 5);
    assert.deepEqual(followup.questions.map(question => question.id), item.questionIds);
    assert.match(followupResponse.message.content, /Question 5 was updated/i);
    assert.match(followupResponse.message.content, /other 4 questions were left unchanged/i);
    const unchanged = await pool.query(
      'SELECT id,prompt,choices,correct_answer,explanation,question_order FROM lesson_quiz_questions WHERE quiz_id=$1 AND question_order<5 ORDER BY question_order',
      [item.quiz.id]
    );
    assert.ok(unchanged.rows.every((question, index) => (
      question.id === item.questionIds[index]
      && question.prompt === `Original question ${index + 1} is true.`
      && question.correct_answer === 'True'
      && question.explanation === 'This statement is true.'
    )));
    const refreshed = await intelligence.list(context.lesson_id, context.instructor_id);
    assert.equal(refreshed.quizzes.find(quiz => quiz.id === item.quiz.id).questions.length, 5);
    const beforeRejectedEdit = await pool.query(
      'SELECT id,prompt,choices,correct_answer,explanation FROM lesson_quiz_questions WHERE quiz_id=$1 AND question_order=2',
      [item.quiz.id]
    );
    await assert.rejects(
      intelligence.applyQuizEdit(item.quiz.id, context.instructor_id, {
        operation: 'update_question',
        targetQuestionNumbers: [2],
        questions: [{ ...mc('Invalid question 2'), choices: ['duplicate', 'duplicate'] }],
        expectedQuestionIds: item.questionIds,
      }),
      error => error.statusCode === 422
    );
    const afterRejectedEdit = await pool.query(
      'SELECT id,prompt,choices,correct_answer,explanation FROM lesson_quiz_questions WHERE quiz_id=$1 AND question_order=2',
      [item.quiz.id]
    );
    assert.deepEqual(afterRejectedEdit.rows[0], beforeRejectedEdit.rows[0]);
    console.log('SINGLE QUESTION PATCH: PASS');
    console.log('RELATIVE LAST QUESTION: PASS');
    console.log('FOLLOW-UP QUESTION REFERENCE: PASS');
    console.log('QUESTION COUNT PRESERVED: PASS');
    console.log('OTHER QUESTIONS PRESERVED: PASS');
    console.log('INVALID EDIT ROLLBACK: PASS');
  } finally {
    if (createdMessageIds.length) {
      await pool.query('DELETE FROM lesson_chat_messages WHERE id=ANY($1::uuid[])', [createdMessageIds]);
      createdMessageIds = [];
    }
    await removeFixture(item, context.instructor_id);
  }

  try {
    item = await fixture(context);
    const result = await intelligence.applyQuizEdit(item.quiz.id, context.instructor_id, {
      operation: 'update_question',
      targetQuestionNumbers: [3],
      questions: [mc('Harder question 3')],
      expectedQuestionIds: item.questionIds,
    });
    assert.equal(result.questions.length, 5);
    assert.equal(result.questions[2].id, item.questionIds[2]);
    assert.deepEqual(result.questions.filter((_, index) => index !== 2).map(question => question.id), item.questionIds.filter((_, index) => index !== 2));
    console.log('QUESTION 3 TARGETING: PASS');
  } finally {
    await removeFixture(item, context.instructor_id);
  }

  try {
    item = await fixture(context);
    const result = await intelligence.applyQuizEdit(item.quiz.id, context.instructor_id, {
      operation: 'delete_question',
      targetQuestionNumbers: [2],
      questions: [],
      expectedQuestionIds: item.questionIds,
    });
    assert.equal(result.questions.length, 4);
    assert.ok(!result.questions.some(question => question.id === item.questionIds[1]));
    console.log('DELETE QUESTION: PASS');
  } finally {
    await removeFixture(item, context.instructor_id);
  }

  try {
    item = await fixture(context);
    const result = await intelligence.applyQuizEdit(item.quiz.id, context.instructor_id, {
      operation: 'add_question',
      targetQuestionNumbers: [],
      questions: [mc('Added question 6')],
      expectedQuestionIds: item.questionIds,
    });
    assert.equal(result.questions.length, 6);
    assert.ok(item.questionIds.every(id => result.questions.some(question => question.id === id)));
    console.log('ADD QUESTION: PASS');
  } finally {
    await removeFixture(item, context.instructor_id);
  }

  try {
    item = await fixture(context);
    const result = await intelligence.applyQuizEdit(item.quiz.id, context.instructor_id, {
      operation: 'regenerate_quiz',
      targetQuestionNumbers: [],
      questions: [mc('Replacement 1'), mc('Replacement 2'), mc('Replacement 3')],
      requestedQuestionCount: 3,
      expectedQuestionIds: item.questionIds,
    });
    assert.equal(result.questions.length, 3);
    console.log('WHOLE QUIZ REGENERATION: PASS');
  } finally {
    await removeFixture(item, context.instructor_id);
    await pool.end();
  }
}

main().catch(error => {
  console.error(`TARGETED QUIZ EDITS: FAIL (${error.message})`);
  process.exitCode = 1;
});
