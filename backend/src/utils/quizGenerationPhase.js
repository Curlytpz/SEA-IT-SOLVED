function phaseForQuizGenerationStage(stage) {
  if (stage === 'QUIZ_AI_RESPONSE_RECEIVED') return 'VALIDATING';
  if (['QUIZ_VALIDATION_PASSED', 'QUIZ_TRANSACTION_STARTED', 'QUIZ_ROW_INSERTED',
    'QUIZ_QUESTIONS_INSERTED', 'QUIZ_CHAT_CONFIRMATION_SAVED'].includes(stage)) return 'SAVING';
  if (stage === 'QUIZ_GENERATION_COMPLETED' || stage === 'QUIZ_TRANSACTION_COMMITTED') return 'COMPLETED';
  return null;
}

module.exports = { phaseForQuizGenerationStage };
