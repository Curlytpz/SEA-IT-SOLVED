const assert = require('node:assert/strict');
const test = require('node:test');
const { runQuizGenerationTransaction } = require('./quizGenerationTransaction');

function harness({ replay = null, persistError = null, confirmationError = null, completionError = null } = {}) {
  const calls = [];
  const stages = [];
  const client = { query: async (sql) => { calls.push(sql); return { rows: [] }; } };
  const operation = runQuizGenerationTransaction({
    client,
    lockScope: 'lesson:instructor',
    generationId: 'generation-123',
    findExisting: async () => replay,
    persistQuiz: async () => {
      calls.push('persist quiz and questions');
      if (persistError) throw persistError;
      return { id: 'quiz-1', questions: [{ id: 'question-1' }] };
    },
    saveConfirmation: async (_client, quiz) => {
      calls.push(`save QUIZ_CREATED ${quiz.id}`);
      if (confirmationError) throw confirmationError;
      return { action: 'QUIZ_CREATED', quizId: quiz.id };
    },
    beforeCommit: async (_client, quiz) => {
      calls.push(`complete job ${quiz.id}`);
      if (completionError) throw completionError;
    },
    onStage: stage => stages.push(stage),
  });
  return { operation, calls, stages };
}

test('quiz and confirmation commit atomically and success references the persisted quiz', async () => {
  const run = harness();
  const result = await run.operation;
  assert.equal(result.quiz.id, 'quiz-1');
  assert.equal(result.message.quizId, result.quiz.id);
  assert.ok(run.calls.indexOf('persist quiz and questions') < run.calls.indexOf('save QUIZ_CREATED quiz-1'));
  assert.ok(run.calls.indexOf('save QUIZ_CREATED quiz-1') < run.calls.indexOf('COMMIT'));
  assert.ok(run.calls.indexOf('complete job quiz-1') < run.calls.indexOf('COMMIT'));
  assert.deepEqual(run.stages.slice(-2), ['QUIZ_CHAT_CONFIRMATION_SAVED', 'QUIZ_TRANSACTION_COMMITTED']);
});

test('job completion failure rolls back quiz, questions, and confirmation together', async () => {
  const run = harness({ completionError: new Error('job completion failed') });
  await assert.rejects(run.operation, /job completion failed/);
  assert.ok(run.calls.includes('ROLLBACK'));
  assert.equal(run.calls.includes('COMMIT'), false);
});

test('question persistence failure rolls back without a quiz-created confirmation', async () => {
  const run = harness({ persistError: new Error('question insert failed') });
  await assert.rejects(run.operation, /question insert failed/);
  assert.ok(run.calls.includes('ROLLBACK'));
  assert.equal(run.calls.some(value => String(value).startsWith('save QUIZ_CREATED')), false);
  assert.ok(run.stages.includes('QUIZ_PERSISTENCE_FAILED'));
});

test('confirmation failure rolls back the quiz transaction', async () => {
  const run = harness({ confirmationError: new Error('message insert failed') });
  await assert.rejects(run.operation, /message insert failed/);
  assert.ok(run.calls.includes('ROLLBACK'));
  assert.equal(run.calls.includes('COMMIT'), false);
  assert.ok(run.stages.includes('QUIZ_CHAT_CONFIRMATION_FAILED'));
});

test('duplicate generation id returns the committed quiz without inserting another', async () => {
  const replay = { message: { action: 'QUIZ_CREATED', quizId: 'quiz-existing' }, quizCreated: true, quiz: { id: 'quiz-existing' } };
  const run = harness({ replay });
  const result = await run.operation;
  assert.equal(result.quiz.id, 'quiz-existing');
  assert.equal(run.calls.includes('persist quiz and questions'), false);
  assert.ok(run.calls.includes('COMMIT'));
});
