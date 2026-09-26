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
  assert.deepEqual(executor.stats(), { active: 0, queued: 0, maxConcurrent: 2, maxPending: 10, maxPendingPerUser: 3 });
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

test('global queue capacity rejects work before it reaches the provider', async () => {
  let release;
  let calls = 0;
  const blocked = new Promise(resolve => { release = resolve; });
  const executor = createAIProviderExecutor({ maxConcurrent: 1, maxPending: 1, maxRetries: 0, logger: quietLogger });
  const first = executor.run(async () => { calls += 1; await blocked; }, { userId: 'one' });
  const second = executor.run(async () => { calls += 1; }, { userId: 'two' });
  await assert.rejects(
    executor.run(async () => { calls += 1; }, { userId: 'three' }),
    error => error.code === 'AI_QUEUE_FULL' && error.statusCode === 503
  );
  assert.equal(calls, 1);
  release();
  await Promise.all([first, second]);
  assert.equal(calls, 2);
});

test('per-user queue capacity is isolated by user', async () => {
  let release;
  const blocked = new Promise(resolve => { release = resolve; });
  const executor = createAIProviderExecutor({ maxConcurrent: 1, maxPending: 4, maxPendingPerUser: 1, maxRetries: 0, logger: quietLogger });
  const first = executor.run(async () => blocked, { userId: 'busy-user' });
  const queued = executor.run(async () => 'queued', { userId: 'busy-user' });
  await assert.rejects(
    executor.run(async () => 'never', { userId: 'busy-user' }),
    error => error.code === 'AI_USER_QUEUE_FULL' && error.statusCode === 429
  );
  const other = executor.run(async () => 'other', { userId: 'other-user' });
  release();
  assert.deepEqual(await Promise.all([first, queued, other]), [undefined, 'queued', 'other']);
});

test('expired queued work is rejected and never reaches the provider', async () => {
  let release;
  let queuedCalls = 0;
  const blocked = new Promise(resolve => { release = resolve; });
  const executor = createAIProviderExecutor({ maxConcurrent: 1, maxPending: 2, queueTimeoutMs: 20, maxRetries: 0, logger: quietLogger });
  const first = executor.run(async () => blocked, { userId: 'one' });
  await assert.rejects(
    executor.run(async () => { queuedCalls += 1; }, { userId: 'two' }),
    error => error.code === 'AI_QUEUE_TIMEOUT' && error.statusCode === 503
  );
  assert.equal(queuedCalls, 0);
  release();
  await first;
});
