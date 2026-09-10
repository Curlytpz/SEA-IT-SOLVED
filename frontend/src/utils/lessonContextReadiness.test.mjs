import assert from 'node:assert/strict';
import {
  createLessonContextDraftGate,
  isExpectedSourcesProcessingError,
  lessonContextReadiness,
} from './lessonContextReadiness.js';

function lesson(workflow) {
  return { id: 'lesson-1', status: 'COMPLETED', workflow };
}

const processing = lessonContextReadiness(lesson({
  recognitionStatus: 'PROCESSING',
  transcriptionStatus: 'FAILED',
  uploadsProcessing: true,
  uploadsReady: false,
  hasUploads: true,
}));
assert.equal(processing.processing, true);
assert.deepEqual(processing.processingSources, ['whiteboard recognition', 'uploaded materials']);
assert.deepEqual(processing.failedSources, ['audio transcription']);
assert.equal(processing.canPrepare, false);

const partialSuccess = lessonContextReadiness(lesson({
  recognitionStatus: 'REVIEW_REQUIRED',
  transcriptionStatus: 'FAILED',
  uploadsProcessing: false,
  uploadsReady: false,
  hasUploads: false,
}));
assert.equal(partialSuccess.processing, false, 'A terminal failure must not be treated as still processing.');
assert.equal(partialSuccess.canPrepare, true, 'One successful source is enough when every source is terminal.');

const noUsableSources = lessonContextReadiness(lesson({
  recognitionStatus: 'FAILED',
  transcriptionStatus: 'FAILED',
  uploadsProcessing: false,
  uploadsReady: false,
  hasUploads: false,
}));
assert.equal(noUsableSources.processing, false);
assert.equal(noUsableSources.canPrepare, false);

const gate = createLessonContextDraftGate();
assert.equal(gate.start(processing.signature), true);
assert.equal(gate.start(processing.signature), false, 'An in-flight request cannot be duplicated.');
gate.finish();
assert.equal(gate.start(processing.signature), false, 'The same server-state signature is attempted only once.');
gate.observe(partialSuccess.signature);
assert.equal(gate.start(partialSuccess.signature), true, 'A real server-state transition permits the next build.');
gate.finish();
assert.equal(gate.start(partialSuccess.signature, { force: true }), true, 'A deliberate manual retry remains possible.');
gate.finish();

assert.equal(isExpectedSourcesProcessingError({ response: { status: 409, data: { error: 'Lesson sources are still processing. Review will be ready when processing finishes.' } } }), true);
assert.equal(isExpectedSourcesProcessingError({ response: { status: 409, data: { error: 'No processed lesson sources are available for review.' } } }), false);

console.log('PASS lesson context readiness, terminal failure handling, expected 409 classification, and one-attempt gate');

