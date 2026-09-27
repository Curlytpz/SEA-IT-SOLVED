export const QUIZ_REQUEST_TIMEOUT_MS = 180000;

export function normalizeWorkspaceIntelligence(value) {
  return {
    ...(value && typeof value === 'object' ? value : {}),
    materials: Array.isArray(value?.materials) ? value.materials : [],
    quizzes: Array.isArray(value?.quizzes) ? value.quizzes : [],
    document: value?.document && typeof value.document === 'object' ? value.document : null,
  };
}

export function createQuizGenerationId() {
  return globalThis.crypto?.randomUUID?.() || `quiz_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

export function quizGenerationFailure(error, timedOut = false) {
  if (timedOut || error?.code === 'ECONNABORTED') return 'Quiz generation took too long. Please try again.';
  return error?.response?.data?.error || 'Quiz generation could not be completed. Please try again.';
}

export function isPersistedQuizResult(result) {
  return Boolean(result?.quiz?.id && result?.message?.action === 'QUIZ_CREATED' && result.message.quizId === result.quiz.id);
}

export function isCurrentWorkspaceRequest(sequence, currentSequence, mounted) {
  return Boolean(mounted && sequence === currentSequence);
}
