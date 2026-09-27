const assert = require('node:assert/strict');
const test = require('node:test');
const { phaseForQuizGenerationStage } = require('./quizGenerationPhase');

test('quiz worker phases progress from provider response through completion', () => {
  assert.equal(phaseForQuizGenerationStage('QUIZ_AI_REQUEST_STARTED'), null);
  assert.equal(phaseForQuizGenerationStage('QUIZ_AI_RESPONSE_RECEIVED'), 'VALIDATING');
  assert.equal(phaseForQuizGenerationStage('QUIZ_VALIDATION_PASSED'), 'SAVING');
  assert.equal(phaseForQuizGenerationStage('QUIZ_TRANSACTION_STARTED'), 'SAVING');
  assert.equal(phaseForQuizGenerationStage('QUIZ_GENERATION_COMPLETED'), 'COMPLETED');
});
