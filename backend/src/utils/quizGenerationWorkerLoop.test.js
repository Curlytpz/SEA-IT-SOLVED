const assert = require('node:assert/strict');
const test = require('node:test');
const { runQuizWorkerIteration } = require('./quizGenerationWorkerLoop');

test('one failed quiz job is contained and the next job is still processed', async () => {
  const jobs = [{ id: 'job-1' }, { id: 'job-2' }];
  const processed = [];
  const contained = [];
  const options = {
    claimNext: async () => jobs.shift() || null,
    processJob: async job => {
      processed.push(job.id);
      if (job.id === 'job-1') throw Object.assign(new Error('state update failed'), { code: '42P08' });
    },
    onJobError: async (error, job) => contained.push({ jobId: job.id, code: error.code }),
  };

  assert.equal(await runQuizWorkerIteration(options), true);
  assert.equal(await runQuizWorkerIteration(options), true);
  assert.deepEqual(processed, ['job-1', 'job-2']);
  assert.deepEqual(contained, [{ jobId: 'job-1', code: '42P08' }]);
});

test('claiming infrastructure failures remain fatal to the worker loop', async () => {
  await assert.rejects(
    runQuizWorkerIteration({
      claimNext: async () => { throw new Error('database unavailable'); },
      processJob: async () => {},
    }),
    /database unavailable/,
  );
});
