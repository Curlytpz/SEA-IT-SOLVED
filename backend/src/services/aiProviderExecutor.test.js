const test = require('node:test');
const assert = require('node:assert/strict');
const { createAIProviderExecutor } = require('./aiProviderExecutor');

const quietLogger = { info() {}, warn() {} };

test('five provider jobs never exceed concurrency two', async () => {
  let active = 0;
  let peak = 0;
  const executor = createAIProviderExecutor({
    maxConcurrent: 2,
    maxRetries: 0,
    logger: quietLogger,
  });
  await Promise.all(Array.from({ length: 5 }, (_, index) => executor.run(async () => {
    active += 1;
    peak = Math.max(peak, active);
    await new Promise(resolve => setTimeout(resolve, 15));
    active -= 1;
    return index;
  }, { operationType: 'CONCURRENCY_TEST' })));
  assert.equal(peak, 2);
  assert.deepEqual(executor.stats(), { active: 0, queued: 0, maxConcurrent: 2 });
});

test('429 retry honors Retry-After before succeeding', async () => {
  const delays = [];
  let attempts = 0;
  const executor = createAIProviderExecutor({
    maxConcurrent: 2,
    maxRetries: 2,
    baseDelayMs: 100,
    sleep: async delay => { delays.push(delay); },
    random: () => 0,
    logger: quietLogger,
  });
  const result = await executor.run(async () => {
    attempts += 1;
    if (attempts === 1) {
      const error = new Error('Resource exhausted');
      error.status = 429;
      error.response = { status: 429, headers: { 'retry-after': '2' } };
      throw error;
    }
    return 'ok';
  });
  assert.equal(result, 'ok');
  assert.equal(attempts, 2);
  assert.deepEqual(delays, [2000]);
});

test('transient failures stop after the configured two retries', async () => {
  let attempts = 0;
  const delays = [];
  const executor = createAIProviderExecutor({
    maxRetries: 2,
    baseDelayMs: 10,
    sleep: async delay => { delays.push(delay); },
    random: () => 0,
    logger: quietLogger,
  });
  await assert.rejects(() => executor.run(async () => {
    attempts += 1;
    const error = new Error('Provider unavailable');
    error.status = 503;
    throw error;
  }), error => error.providerRetriesExhausted === true && error.providerAttemptCount === 3);
  assert.equal(attempts, 3);
  assert.deepEqual(delays, [10, 20]);
});

test('invalid provider requests are not retried', async () => {
  let attempts = 0;
  const delays = [];
  const executor = createAIProviderExecutor({
    maxRetries: 2,
    sleep: async delay => { delays.push(delay); },
    logger: quietLogger,
  });
  await assert.rejects(() => executor.run(async () => {
    attempts += 1;
    const error = new Error('Invalid request');
    error.status = 400;
    error.code = 'PROVIDER_REQUEST_INVALID';
    error.retryable = true;
    throw error;
  }));
  assert.equal(attempts, 1);
  assert.deepEqual(delays, []);
});
