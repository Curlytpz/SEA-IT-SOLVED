const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const singleFlight = require('./singleFlight');

test('duplicate quiz generation requests share one provider operation', async () => {
  let providerCalls = 0;
  const resourceKey = singleFlight.key(['lesson-quiz', 'instructor-1', 'lesson-1', { difficulty: 'MEDIUM' }]);
  const operation = async () => {
    providerCalls += 1;
    await new Promise(resolve => setTimeout(resolve, 10));
    return { id: 'quiz-1' };
  };
  const [first, second] = await Promise.all([
    singleFlight.run(resourceKey, operation),
    singleFlight.run(resourceKey, operation),
  ]);
  assert.equal(providerCalls, 1);
  assert.deepEqual(first, second);
});

test('duplicate recognition queue requests share one queue operation', async () => {
  let queueCalls = 0;
  const resourceKey = singleFlight.key(['capture-recognition', 'instructor-1', 'capture-1']);
  const operation = async () => {
    queueCalls += 1;
    await new Promise(resolve => setTimeout(resolve, 10));
    return { queued: true };
  };
  await Promise.all([singleFlight.run(resourceKey, operation), singleFlight.run(resourceKey, operation)]);
  assert.equal(queueCalls, 1);
});

test('durable recognition and transcription claims use row locks with skip locked', () => {
  const services = ['recognition.service.js', 'lesson-recognition.service.js', 'transcription.service.js'];
  for (const filename of services) {
    const source = fs.readFileSync(path.join(__dirname, '..', 'services', filename), 'utf8');
    assert.match(source, /FOR UPDATE SKIP LOCKED/i, filename);
  }
});
