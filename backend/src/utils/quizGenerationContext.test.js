const assert = require('node:assert/strict');
const test = require('node:test');
const { compactQuizContextWithMetrics } = require('./quizGenerationContext');

test('quiz context keeps canonical approved content and drops diagnostics and empty metadata', () => {
  const source = [{
    type: 'WHITEBOARD', source: 'Whiteboard Page 1', text: 'Evaluate the limit.',
    math: ['\\lim_{x \\to 1} f(x)', '\\lim_{x \\to 1} f(x)'],
    uncertain: true,
    boundingBoxes: [{ x: 1, y: 2, width: 3, height: 4 }],
    confidence: 0.51,
    diagnostics: { rawOcr: 'duplicate data that is not approved quiz context' },
  }, {
    type: 'SPEECH', source: 'Transcript 0:00–0:05', text: 'Use the left-hand limit.',
    math: [], uncertain: false,
  }];
  const { payload, metrics } = compactQuizContextWithMetrics(source);
  assert.deepEqual(payload, [{
    type: 'WHITEBOARD', source: 'Whiteboard Page 1', text: 'Evaluate the limit.',
    math: ['\\lim_{x \\to 1} f(x)'],
  }, {
    type: 'SPEECH', source: 'Transcript 0:00–0:05', text: 'Use the left-hand limit.',
  }]);
  assert.ok(metrics.compactBytes < metrics.originalBytes);
  assert.equal(metrics.chunkCount, 2);
});

test('empty chunks do not inflate the Gemini quiz context', () => {
  const { payload } = compactQuizContextWithMetrics([
    { type: 'OTHER', source: 'empty', text: '   ', math: [], uncertain: true },
  ]);
  assert.deepEqual(payload, []);
});
