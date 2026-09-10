const assert = require('node:assert/strict');

process.env.GEMINI_SHARED_MIN_REQUEST_INTERVAL_MS = '0';
process.env.GEMINI_SHARED_RATE_LIMIT_BACKOFF_MS = '5000';
process.env.GEMINI_INTERACTIVE_MAX_ATTEMPTS = '2';

require('../src/config/env');
const pool = require('../src/db/pool');
const geminiInteractive = require('../src/services/geminiInteractive.service');

async function main() {
  let calls = 0;
  const result = await geminiInteractive.run(
    async ({ attempt }) => {
      calls += 1;
      if (attempt === 1) {
        const error = new Error('Simulated provider outage.');
        error.code = 'PROVIDER_UNAVAILABLE';
        error.status = 503;
        error.retryable = true;
        throw error;
      }
      return 'validated-new-response';
    },
    { unavailable: 'Quiz generation could not be completed. Try again.' },
    { label: 'QuizAI', model: 'test-model' }
  );
  assert.equal(calls, 2);
  assert.equal(result, 'validated-new-response');
  console.log('QUIZ RETRY: PASS');
  console.log('NEW REQUEST ON RETRY: PASS');
}

main().catch(error => {
  console.error(`QUIZ RETRY: FAIL (${error.message})`);
  process.exitCode = 1;
}).finally(() => pool.end());
