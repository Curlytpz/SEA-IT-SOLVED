const test = require('node:test');
const assert = require('node:assert/strict');
const { assertRecognitionBudget } = require('./lesson-recognition.service');
const { RECOGNITION_MAX_CAPTURES, RECOGNITION_MAX_AGGREGATE_MB } = require('../config/env');

test('lesson recognition accepts inputs within both budgets', () => {
  assert.doesNotThrow(() => assertRecognitionBudget(RECOGNITION_MAX_CAPTURES, RECOGNITION_MAX_AGGREGATE_MB * 1024 * 1024));
});

test('lesson recognition rejects capture-count and aggregate-byte overflow', () => {
  assert.throws(() => assertRecognitionBudget(RECOGNITION_MAX_CAPTURES + 1, 0), error => error.statusCode === 413);
  assert.throws(() => assertRecognitionBudget(1, RECOGNITION_MAX_AGGREGATE_MB * 1024 * 1024 + 1), error => error.statusCode === 413);
});
