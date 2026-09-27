const assert = require('node:assert/strict');
const test = require('node:test');
const service = require('../services/lesson-chat.service');
const controller = require('./lesson-chat.controller');

function invoke(handler, body = {}) {
  return new Promise((resolve, reject) => {
    const response = {
      statusCode: 200,
      status(code) { this.statusCode = code; return this; },
      json(payload) { resolve({ status: this.statusCode, payload }); return this; },
    };
    handler({ params: { lessonId: 'lesson-1' }, user: { id: 'instructor-1' }, body, query: {} }, response, reject);
  });
}

test('quiz generation request returns 202 as soon as the durable job is queued', async () => {
  const original = service.createQuiz;
  service.createQuiz = async () => ({ queued: true, job: { id: 'job-1', status: 'PENDING' } });
  try {
    const response = await invoke(controller.generateQuiz, { generationId: 'generation-1' });
    assert.equal(response.status, 202);
    assert.equal(response.payload.data.job.id, 'job-1');
    assert.equal(response.payload.data.job.status, 'PENDING');
  } finally { service.createQuiz = original; }
});

test('quiz option clarification remains an immediate non-job response', async () => {
  const original = service.createQuiz;
  service.createQuiz = async () => ({ requiresQuizOptions: true });
  try {
    const response = await invoke(controller.generateQuiz);
    assert.equal(response.status, 201);
    assert.equal(response.payload.data.requiresQuizOptions, true);
  } finally { service.createQuiz = original; }
});
