const assert = require('node:assert/strict');
const pool = require('../src/db/pool');
const service = require('../src/services/lesson-intelligence.service');

const originalQuery = pool.query;
const originalConnect = pool.connect;

const quizRow = status => ({
  id: 'quiz-1', lesson_id: 'lesson-1', instructor_id: 'owner-1', title: 'Limits Quiz',
  instructions: 'Answer every question.', difficulty: 'MEDIUM', status, outdated: false,
  published_at: new Date().toISOString(), created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
});

async function verifyStatusAndOwnership() {
  pool.query = async (sql, values) => {
    if (sql.includes('UPDATE lesson_quizzes')) return { rows: [quizRow(values[2])] };
    if (sql.includes('lesson_quiz_questions')) return { rows: [] };
    return { rows: [] };
  };
  assert.equal((await service.setQuizStatus('quiz-1', 'owner-1', 'DISABLED')).status, 'DISABLED');
  assert.equal((await service.setQuizStatus('quiz-1', 'owner-1', 'PUBLISHED')).status, 'PUBLISHED');

  pool.query = async () => ({ rows: [] });
  await assert.rejects(service.setQuizStatus('quiz-2', 'other-owner', 'DISABLED'), error => error.statusCode === 404);
  await assert.rejects(service.setQuizStatus('quiz-1', 'owner-1', 'DRAFT'), error => error.statusCode === 400);
}

function deletionClient(attemptCount, { ownerId = 'owner-1', deleteRowCount = 1, failOn = '' } = {}) {
  let deleted = false;
  let committed = false;
  let rolledBack = false;
  const mutations = [];
  const client = {
    async query(sql) {
      if (sql === 'BEGIN') return { rows: [] };
      if (sql === 'COMMIT') { committed = true; return { rows: [] }; }
      if (sql === 'ROLLBACK') { rolledBack = true; return { rows: [] }; }
      if (sql.includes('SELECT id,instructor_id,title,status')) return { rows: [{ ...quizRow('DRAFT'), instructor_id: ownerId }] };
      if (sql.includes('COUNT(*)')) return { rows: [{ count: attemptCount }] };
      if (sql.includes('DELETE FROM quiz_attempt_answers')) {
        mutations.push('answers');
        if (failOn === 'answers') throw new Error('Simulated force delete failure.');
        return { rowCount: attemptCount };
      }
      if (sql.includes('DELETE FROM quiz_attempts')) {
        mutations.push('attempts');
        if (failOn === 'attempts') throw new Error('Simulated force delete failure.');
        return { rowCount: attemptCount };
      }
      if (sql.includes('DELETE FROM lesson_quizzes')) { mutations.push('quiz'); deleted = deleteRowCount === 1; return { rowCount: deleteRowCount, rows: deleteRowCount ? [{ id: 'quiz-1' }] : [] }; }
      throw new Error(`Unexpected SQL in quiz management test: ${sql}`);
    },
    release() {},
    wasDeleted: () => deleted,
    committed: () => committed,
    rolledBack: () => rolledBack,
    mutations: () => mutations,
  };
  return client;
}

async function verifyDeletionSafety() {
  const emptyClient = deletionClient(0);
  pool.connect = async () => emptyClient;
  assert.equal((await service.deleteQuiz('quiz-1', 'owner-1')).deleted, true);
  assert.equal(emptyClient.wasDeleted(), true);

  const submittedClient = deletionClient(2);
  pool.connect = async () => submittedClient;
  await assert.rejects(service.deleteQuiz('quiz-1', 'owner-1'), error => (
    error.statusCode === 409
    && error.code === 'QUIZ_HAS_ATTEMPTS'
    && error.details.attemptCount === 2
  ));
  assert.equal(submittedClient.wasDeleted(), false);
  assert.deepEqual(submittedClient.mutations(), []);
  assert.equal(submittedClient.rolledBack(), true);

  const forcedClient = deletionClient(3);
  pool.connect = async () => forcedClient;
  const forced = await service.deleteQuiz('quiz-1', 'owner-1', { force: true });
  assert.equal(forced.deleted, true);
  assert.equal(forced.forceDeleted, true);
  assert.equal(forced.attemptsRemoved, 3);
  assert.deepEqual(forcedClient.mutations(), ['answers', 'attempts', 'quiz']);
  assert.equal(forcedClient.committed(), true);

  const failedForceClient = deletionClient(3, { failOn: 'attempts' });
  pool.connect = async () => failedForceClient;
  await assert.rejects(service.deleteQuiz('quiz-1', 'owner-1', { force: true }), /Simulated force delete failure/);
  assert.equal(failedForceClient.committed(), false);
  assert.equal(failedForceClient.rolledBack(), true);
  assert.equal(failedForceClient.wasDeleted(), false);

  const unauthorizedClient = deletionClient(0, { ownerId: 'owner-2' });
  pool.connect = async () => unauthorizedClient;
  await assert.rejects(service.deleteQuiz('quiz-1', 'owner-1'), error => error.statusCode === 404);
  assert.equal(unauthorizedClient.wasDeleted(), false);
  assert.deepEqual(unauthorizedClient.mutations(), []);

  const unauthorizedForcedClient = deletionClient(4, { ownerId: 'owner-2' });
  pool.connect = async () => unauthorizedForcedClient;
  await assert.rejects(service.deleteQuiz('quiz-1', 'owner-1', { force: true }), error => error.statusCode === 404);
  assert.deepEqual(unauthorizedForcedClient.mutations(), []);

  const zeroMutationClient = deletionClient(0, { deleteRowCount: 0 });
  pool.connect = async () => zeroMutationClient;
  await assert.rejects(service.deleteQuiz('quiz-1', 'owner-1'), error => error.statusCode === 409 && /could not be completed/.test(error.message));
  assert.equal(zeroMutationClient.committed(), false);
  assert.equal(zeroMutationClient.rolledBack(), true);
}

(async () => {
  try {
    await verifyStatusAndOwnership();
    await verifyDeletionSafety();
    console.log('Quiz management verification passed.');
  } finally {
    pool.query = originalQuery;
    pool.connect = originalConnect;
    await pool.end();
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
