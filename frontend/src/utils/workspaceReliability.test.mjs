import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {
  QUIZ_REQUEST_TIMEOUT_MS,
  isCurrentWorkspaceRequest,
  isPersistedQuizResult,
  normalizeWorkspaceIntelligence,
  quizGenerationFailure,
} from './workspaceReliability.js';

test('normal and malformed workspace payloads always expose render-safe collections', () => {
  assert.deepEqual(normalizeWorkspaceIntelligence(null), { materials: [], quizzes: [], document: null });
  const valid = normalizeWorkspaceIntelligence({ materials: [{ id: 'm1' }], quizzes: [{ id: 'q1' }], document: { title: 'Lesson' } });
  assert.equal(valid.materials.length, 1);
  assert.equal(valid.quizzes.length, 1);
});

test('quiz success requires a matching persisted quiz identifier', () => {
  assert.equal(isPersistedQuizResult({ quiz: { id: 'q1' }, message: { action: 'QUIZ_CREATED', quizId: 'q1' } }), true);
  assert.equal(isPersistedQuizResult({ quiz: { id: 'q1' }, message: { action: 'QUIZ_CREATED', quizId: 'missing' } }), false);
  assert.equal(isPersistedQuizResult({ message: { action: 'QUIZ_CREATED', quizId: 'q1' } }), false);
});

test('timeout and backend failures produce visible terminal messages', () => {
  assert.equal(QUIZ_REQUEST_TIMEOUT_MS, 180000);
  assert.match(quizGenerationFailure({ code: 'ECONNABORTED' }), /took too long/i);
  assert.equal(quizGenerationFailure({ response: { data: { error: 'Persistence failed safely.' } } }), 'Persistence failed safely.');
});

test('stale or unmounted requests cannot update a new workspace', () => {
  assert.equal(isCurrentWorkspaceRequest(3, 3, true), true);
  assert.equal(isCurrentWorkspaceRequest(2, 3, true), false);
  assert.equal(isCurrentWorkspaceRequest(3, 3, false), false);
});

test('workspace page includes explicit load failure and scoped error-boundary fallbacks', () => {
  const page = fs.readFileSync(new URL('../pages/instructor/LessonContextReview.jsx', import.meta.url), 'utf8');
  const boundary = fs.readFileSync(new URL('../components/reasoning/WorkspaceErrorBoundary.jsx', import.meta.url), 'utf8');
  assert.match(page, /Workspace could not load/);
  assert.match(page, /loadController\.current\?\.abort/);
  assert.match(boundary, /Something went wrong loading this workspace/);
  assert.match(boundary, />Retry</);
  assert.match(boundary, /Back to Lessons/);
  assert.match(boundary, /\/instructor\/sections/);
});
