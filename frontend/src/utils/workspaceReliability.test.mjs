import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {
  QUIZ_REQUEST_TIMEOUT_MS,
  isCurrentWorkspaceRequest,
  isPersistedQuizResult,
  normalizeApiError,
  normalizeGenerationTask,
  normalizeLessonChatResult,
  normalizePendingQuizRequest,
  normalizeWorkspaceIntelligence,
  quizGenerationFailure,
  restoredPendingQuizRequest,
  safeRuntimeDiagnostic,
} from './workspaceReliability.js';

test('normal and malformed workspace payloads always expose render-safe collections', () => {
  assert.deepEqual(normalizeWorkspaceIntelligence(null), { materials: [], quizzes: [], document: null });
  const valid = normalizeWorkspaceIntelligence({ materials: [{ id: 'm1' }], quizzes: [{ id: 'q1' }], document: { title: 'Lesson' } });
  assert.equal(valid.materials.length, 1);
  assert.equal(valid.quizzes.length, 1);
  assert.deepEqual(normalizeWorkspaceIntelligence({ quizzes: [{ id: 'q1', questions: null }, null] }).quizzes[0].questions, []);
});

test('reproduces the former partial quiz metadata render exception and canonicalizes it', () => {
  const malformed = { missingQuizParameters: { difficulty: true } };
  assert.throws(() => malformed.missingQuizParameters.includes('difficulty'), /includes is not a function/);
  const pending = normalizePendingQuizRequest({
    quizDraft: { questionCount: 5, difficulty: null, questionType: 'MULTIPLE_CHOICE' },
    missingQuizParameters: malformed.missingQuizParameters,
    content: 'What difficulty would you like?',
  });
  assert.deepEqual(pending.missingParameters, ['difficulty']);
  assert.equal(pending.instruction, 'What difficulty would you like?');
});

test('QUIZ_OPTIONS_REQUIRED restores safely and supplying difficulty completes the request', () => {
  const messages = normalizeLessonChatResult({ messages: [{
    role: 'ASSISTANT', action: 'QUIZ_OPTIONS_REQUIRED', content: 'What difficulty would you like?',
    quizPrompt: 'Generate 5 questions.',
    quizDraft: { questionCount: 5, difficulty: null, questionType: 'MIXED' },
    missingQuizParameters: ['difficulty'],
  }] }).messages;
  const restored = restoredPendingQuizRequest(messages);
  assert.equal(restored.questionType, 'MIXED');
  assert.deepEqual(restored.missingParameters, ['difficulty']);
  const resumed = normalizePendingQuizRequest({ ...restored, difficulty: 'HARD' });
  assert.deepEqual(resumed.missingParameters, []);
  assert.equal(resumed.difficulty, 'HARD');
});

test('partial drafts and mixed objective requests remain canonical and renderable', () => {
  const partial = normalizePendingQuizRequest({ quizDraft: { questionCount: '5' }, missingQuizParameters: null });
  assert.equal(partial.questionCount, 5);
  assert.deepEqual(partial.missingParameters, ['difficulty', 'questionType']);
  const mixed = normalizePendingQuizRequest({ questionCount: 5, difficulty: 'medium', questionType: 'mixed' });
  assert.deepEqual(mixed.missingParameters, []);
  assert.equal(mixed.questionType, 'MIXED');
});

test('generation progress is clamped and malformed stages cannot crash rendering', () => {
  assert.equal(normalizeGenerationTask({ status: 'running', progress: 950, stages: null }).progress, 100);
  assert.deepEqual(normalizeGenerationTask({ status: 'running', progress: Number.NaN, stages: {} }).stages, []);
  assert.equal(normalizeGenerationTask({ status: 'unknown', progress: -10 }).status, 'failed');
});

test('quiz success requires a matching persisted quiz identifier', () => {
  assert.equal(isPersistedQuizResult({ quiz: { id: 'q1' }, message: { action: 'QUIZ_CREATED', quizId: 'q1' } }), true);
  assert.equal(isPersistedQuizResult({ quiz: { id: 'q1' }, message: { action: 'QUIZ_CREATED', quizId: 'missing' } }), false);
  assert.equal(isPersistedQuizResult({ message: { action: 'QUIZ_CREATED', quizId: 'q1' } }), false);
});

test('timeout and backend failures produce visible terminal messages', () => {
  assert.equal(QUIZ_REQUEST_TIMEOUT_MS, 180000);
  assert.match(quizGenerationFailure({ code: 'ECONNABORTED' }).message, /took too long/i);
  assert.equal(quizGenerationFailure({ response: { data: { error: 'Persistence failed safely.' } } }).message, 'Persistence failed safely.');
});

test('HTTP 502 and malformed failures always become render-safe error objects', () => {
  assert.deepEqual(quizGenerationFailure({ response: { status: 502, data: { error: {
    code: 'QUIZ_GENERATION_FAILED', message: 'The quiz could not be generated.',
  } } } }), {
    code: 'QUIZ_GENERATION_FAILED', message: 'The quiz could not be generated.', status: 502,
  });
  assert.equal(normalizeApiError({ response: { status: 502, data: { code: 'ROUTER_EXTERNAL_TARGET_ERROR', message: 'Bad Gateway' } } }).message, 'Bad Gateway');
  assert.equal(normalizeApiError({ isAxiosError: true, code: 'ERR_NETWORK', message: 'Network Error' }, 'Unable to reach the quiz service.').message, 'Unable to reach the quiz service.');
  assert.equal(normalizeApiError({ response: { status: 500, data: { error: { message: { unsafe: true } } } } }, 'Safe fallback.').message, 'Safe fallback.');
  assert.equal(normalizeApiError(null, 'Safe fallback.').message, 'Safe fallback.');
  assert.equal(normalizeGenerationTask({ status: 'failed', error: { code: 'QUIZ_GENERATION_FAILED', message: 'Unable to generate quiz.' } }).error.message, 'Unable to generate quiz.');
});

test('stale or unmounted requests cannot update a new workspace', () => {
  assert.equal(isCurrentWorkspaceRequest(3, 3, true), true);
  assert.equal(isCurrentWorkspaceRequest(2, 3, true), false);
  assert.equal(isCurrentWorkspaceRequest(3, 3, false), false);
});

test('workspace page includes explicit load failure and scoped error-boundary fallbacks', () => {
  const page = fs.readFileSync(new URL('../pages/instructor/LessonContextReview.jsx', import.meta.url), 'utf8');
  const assistant = fs.readFileSync(new URL('../components/reasoning/LessonChatAssistant.jsx', import.meta.url), 'utf8');
  const boundary = fs.readFileSync(new URL('../components/reasoning/WorkspaceErrorBoundary.jsx', import.meta.url), 'utf8');
  assert.match(page, /Workspace could not load/);
  assert.match(page, /loadController\.current\?\.abort/);
  assert.match(page, /normalizeWorkspaceIntelligence\(\{ quizzes: \[nextQuiz\] \}\)/);
  assert.match(assistant, /normalizeLessonChatResult\(result\)/);
  assert.match(assistant, /normalizePendingQuizRequest\(quizOptions\)/);
  assert.match(assistant, /visibleDocumentTask\.error\.message/);
  assert.match(boundary, /Something went wrong loading this workspace/);
  assert.match(boundary, />Retry</);
  assert.match(boundary, /Back to Lessons/);
  assert.match(boundary, /\/instructor\/sections/);
  assert.match(boundary, /revision: current\.revision \+ 1/);
  assert.match(boundary, /key=\{this\.state\.revision\}/);
});

test('error diagnostics retain bounded technical metadata without exposing UI stacks', () => {
  const diagnostic = safeRuntimeDiagnostic(new TypeError('missingQuizParameters.includes is not a function'), {
    componentStack: '\n at LessonChatAssistant (LessonChatAssistant.jsx:717)\n at LessonContextReview',
  });
  assert.equal(diagnostic.name, 'TypeError');
  assert.match(diagnostic.message, /includes is not a function/);
  assert.ok(diagnostic.componentStack.length <= 8);
});
