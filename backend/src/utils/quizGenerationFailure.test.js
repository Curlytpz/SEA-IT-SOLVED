const assert = require('node:assert/strict');
const test = require('node:test');
const { mapInteractiveFailure } = require('../services/geminiInteractive.service');
const { runQuizGenerationWithinDeadline } = require('./quizGenerationDeadline');

test('quiz deadline aborts work and returns a structured 504 failure', async () => {
  let aborted = false;
  await assert.rejects(
    runQuizGenerationWithinDeadline(signal => new Promise((_resolve, reject) => {
      signal.addEventListener('abort', () => {
        aborted = true;
        const error = new Error('aborted');
        error.name = 'AbortError';
        reject(error);
      }, { once: true });
    }), 15),
    error => error.statusCode === 504 && error.code === 'QUIZ_TIMEOUT' && /timed out/i.test(error.message),
  );
  assert.equal(aborted, true);
});

test('quiz deadline preserves a normal successful generation result', async () => {
  assert.deepEqual(await runQuizGenerationWithinDeadline(async () => ({ id: 'quiz-1' }), 100), { id: 'quiz-1' });
});

test('interactive quiz failures map to stable status and code contracts', () => {
  const timeout = mapInteractiveFailure({ code: 'PROVIDER_TIMEOUT' }, { timeoutCode: 'QUIZ_TIMEOUT', timeout: 'Quiz timed out.' });
  assert.equal(timeout.statusCode, 504);
  assert.equal(timeout.code, 'QUIZ_TIMEOUT');
  const invalid = mapInteractiveFailure({ code: 'INVALID_PROVIDER_OUTPUT' }, { invalidOutputCode: 'QUIZ_AI_RESPONSE_INVALID', invalidOutput: 'Invalid quiz.' });
  assert.equal(invalid.statusCode, 422);
  assert.equal(invalid.code, 'QUIZ_AI_RESPONSE_INVALID');
  const upstream = mapInteractiveFailure({ code: 'PROVIDER_UNAVAILABLE' }, { unavailableCode: 'QUIZ_AI_REQUEST_FAILED', unavailable: 'Quiz unavailable.' });
  assert.equal(upstream.statusCode, 503);
  assert.equal(upstream.code, 'QUIZ_AI_REQUEST_FAILED');
});
