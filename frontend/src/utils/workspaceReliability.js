export const QUIZ_REQUEST_TIMEOUT_MS = 180000;
const QUIZ_TYPES = new Set(['MULTIPLE_CHOICE', 'TRUE_FALSE', 'PROBLEM_SOLVING', 'MIXED']);
const QUIZ_DIFFICULTIES = new Set(['EASY', 'MEDIUM', 'HARD']);
const QUIZ_PARAMETERS = ['questionCount', 'difficulty', 'questionType'];

function text(value, fallback = '') {
  return typeof value === 'string' ? value : value == null ? fallback : String(value);
}

function quizType(value) {
  const normalized = text(value).trim().toUpperCase().replace(/[\s-]+/g, '_');
  return QUIZ_TYPES.has(normalized) ? normalized : null;
}

function quizDifficulty(value) {
  const normalized = text(value).trim().toUpperCase();
  return QUIZ_DIFFICULTIES.has(normalized) ? normalized : null;
}

function quizCount(value) {
  const normalized = Number(value);
  return Number.isInteger(normalized) && normalized >= 1 && normalized <= 20 ? normalized : null;
}

function missingParameters(value, draft) {
  // The canonical draft is authoritative. Persisted `missing` metadata is only
  // a historical hint and must not keep a field stale after the user fills it.
  void value;
  return QUIZ_PARAMETERS.filter(key => draft[key] == null);
}

export function normalizeQuizDraft(value) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  return {
    difficulty: quizDifficulty(source.difficulty),
    questionType: quizType(source.questionType),
    questionCount: quizCount(source.questionCount),
  };
}

export function normalizePendingQuizRequest(value, fallbackPrompt = '') {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const draft = normalizeQuizDraft(value.quizDraft || value);
  const missing = missingParameters(value.missingQuizParameters || value.missingParameters, draft);
  return {
    prompt: text(value.quizPrompt || value.prompt, fallbackPrompt).trim(),
    ...draft,
    missingParameters: missing,
    instruction: text(value.instruction || value.content),
  };
}

export function normalizeChatMessage(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return {
    ...value,
    role: value.role === 'USER' ? 'USER' : 'ASSISTANT',
    content: text(value.content),
    sourceReferences: Array.isArray(value.sourceReferences) ? value.sourceReferences.filter(item => typeof item === 'string') : [],
    quizDraft: value.quizDraft && typeof value.quizDraft === 'object' && !Array.isArray(value.quizDraft) ? normalizeQuizDraft(value.quizDraft) : null,
    missingQuizParameters: Array.isArray(value.missingQuizParameters) ? value.missingQuizParameters.filter(item => QUIZ_PARAMETERS.includes(item)) : [],
  };
}

export function normalizeLessonChatResult(value) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  return {
    ...source,
    messages: Array.isArray(source.messages) ? source.messages.map(normalizeChatMessage).filter(Boolean) : [],
    conversations: Array.isArray(source.conversations) ? source.conversations.filter(item => item && typeof item === 'object') : [],
    activeConversationId: typeof source.activeConversationId === 'string' ? source.activeConversationId : null,
  };
}

export function restoredPendingQuizRequest(messages) {
  const relevant = [...(Array.isArray(messages) ? messages : [])].reverse().find(message =>
    message?.role === 'ASSISTANT' && ['QUIZ_OPTIONS_REQUIRED', 'QUIZ_CREATED'].includes(message.action)
  );
  return relevant?.action === 'QUIZ_OPTIONS_REQUIRED' ? normalizePendingQuizRequest(relevant) : null;
}

export function normalizeProgress(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(100, Math.max(0, Math.round(number))) : 0;
}

export function normalizeGenerationTask(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const status = ['running', 'completed', 'failed'].includes(value.status) ? value.status : 'failed';
  return {
    ...value,
    status,
    title: text(value.title, 'Quiz generation'),
    detail: text(value.detail, status === 'failed' ? 'Update stopped' : 'Starting...'),
    error: text(value.error),
    progress: normalizeProgress(value.progress),
    stages: Array.isArray(value.stages) ? value.stages.filter(stage => stage && typeof stage === 'object') : [],
  };
}

export function safeRuntimeDiagnostic(error, info, development = false) {
  const clean = value => text(value).replace(/[\r\n\t]+/g, ' ').slice(0, 240);
  const stack = text(error?.stack).split('\n').slice(1, 5).map(clean).filter(Boolean);
  const componentStack = text(info?.componentStack).split('\n').slice(0, 8).map(clean).filter(Boolean);
  return {
    name: clean(error?.name || 'Error'),
    message: development ? clean(error?.message || 'Workspace render failed') : clean(error?.message || 'Workspace render failed'),
    stack,
    componentStack,
  };
}

export function normalizeWorkspaceIntelligence(value) {
  return {
    ...(value && typeof value === 'object' ? value : {}),
    materials: Array.isArray(value?.materials) ? value.materials.filter(item => item && typeof item === 'object') : [],
    quizzes: Array.isArray(value?.quizzes) ? value.quizzes.filter(item => item && typeof item === 'object').map(quiz => ({
      ...quiz,
      questions: Array.isArray(quiz.questions) ? quiz.questions.filter(item => item && typeof item === 'object') : [],
    })) : [],
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
