import assert from 'node:assert/strict';
import {
  captureRecognitionStatus,
  isRecognitionRetryable,
  isRecognitionRunning,
  normalizeRecognitionStatus,
} from './recognitionStatus.js';

assert.equal(normalizeRecognitionStatus('needs_retry'), 'FAILED');
assert.equal(normalizeRecognitionStatus('needs attention'), 'FAILED');
assert.equal(normalizeRecognitionStatus('queued'), 'PENDING');
assert.equal(isRecognitionRetryable('error'), true);
assert.equal(isRecognitionRetryable('PROCESSING'), false);
assert.equal(isRecognitionRunning('queued'), true);
assert.equal(isRecognitionRunning('FAILED'), false);

assert.equal(
  captureRecognitionStatus({ recognition: { status: 'PROCESSING' } }, { status: 'FAILED' }),
  'PROCESSING',
  'A page-specific retry state must take precedence over stale whole-lesson failure state.',
);
assert.equal(
  captureRecognitionStatus({ recognition: null }, { status: 'FAILED' }),
  'FAILED',
  'The whole-lesson failure remains an actionable fallback when the page has no separate record.',
);

console.log('PASS recognition retry status normalization and page-specific precedence');
