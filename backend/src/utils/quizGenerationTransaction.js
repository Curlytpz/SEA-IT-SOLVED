async function runQuizGenerationTransaction({
  client,
  lockScope,
  generationId,
  findExisting,
  persistQuiz,
  saveConfirmation,
  beforeCommit = async () => {},
  onStage = () => {},
}) {
  let phase = 'transaction';
  const persistenceStartedAt = Date.now();
  try {
    await client.query('BEGIN');
    onStage('QUIZ_TRANSACTION_STARTED');
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1),hashtext($2))', [lockScope, generationId]);
    const replay = await findExisting(client);
    if (replay) {
      phase = 'completion';
      await beforeCommit(client, replay.quiz);
      await client.query('COMMIT');
      onStage('QUIZ_TRANSACTION_COMMITTED', {
        quizId: replay.quiz.id,
        idempotentReplay: true,
        durationMs: Date.now() - persistenceStartedAt,
      });
      return replay;
    }
    phase = 'persistence';
    const quiz = await persistQuiz(client);
    phase = 'confirmation';
    const message = await saveConfirmation(client, quiz);
    onStage('QUIZ_CHAT_CONFIRMATION_SAVED', { quizId: quiz.id });
    phase = 'completion';
    await beforeCommit(client, quiz);
    await client.query('COMMIT');
    onStage('QUIZ_TRANSACTION_COMMITTED', { quizId: quiz.id, durationMs: Date.now() - persistenceStartedAt });
    return { message, quizCreated: true, quiz };
  } catch (error) {
    await client.query('ROLLBACK');
    onStage('QUIZ_TRANSACTION_ROLLED_BACK');
    onStage(phase === 'completion' ? 'QUIZ_JOB_COMPLETION_FAILED' : phase === 'confirmation' ? 'QUIZ_CHAT_CONFIRMATION_FAILED' : 'QUIZ_PERSISTENCE_FAILED', {
      name: error?.name,
      code: error?.code || null,
    });
    throw error;
  }
}

module.exports = { runQuizGenerationTransaction };
