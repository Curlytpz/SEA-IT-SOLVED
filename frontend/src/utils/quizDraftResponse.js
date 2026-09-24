const QUIZ_TITLE_KEYS = ['title', 'quiz_title', 'quizTitle'];
const QUIZ_QUESTION_KEYS = ['questions', 'items'];

function firstValue(source, keys) {
  for (const key of keys) {
    if (source?.[key] != null) return source[key];
  }
  return undefined;
}

function text(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function questionType(value, choices) {
  const normalized = text(value).replaceAll('-', '_').replaceAll(' ', '_').toUpperCase();
  if (normalized) return normalized;
  return choices.length ? 'MULTIPLE_CHOICE' : 'SHORT_ANSWER';
}

function normalizeQuestion(question, index) {
  if (!question || typeof question !== 'object' || Array.isArray(question)) return null;
  const choices = firstValue(question, ['options', 'choices']);
  const normalizedChoices = Array.isArray(choices)
    ? choices.map(choice => typeof choice === 'string' ? choice.trim() : text(choice?.text || choice?.label)).filter(Boolean)
    : [];
  const prompt = text(firstValue(question, ['question_text', 'questionText', 'prompt', 'question', 'text']));
  if (!prompt) return null;
  const order = Number(firstValue(question, ['question_number', 'questionNumber', 'order'])) || index + 1;
  return {
    id: text(question.id) || `preview-question-${index + 1}`,
    order,
    prompt,
    choices: normalizedChoices,
    type: questionType(firstValue(question, ['question_type', 'questionType', 'type']), normalizedChoices),
    correctAnswer: text(firstValue(question, ['correct_answer', 'correctAnswer'])),
    explanation: text(question.explanation),
  };
}

export function normalizeQuizDraftPayload(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const source = value.quiz && typeof value.quiz === 'object'
    ? value.quiz
    : value.data?.quiz && typeof value.data.quiz === 'object'
      ? value.data.quiz
      : value;
  const title = text(firstValue(source, QUIZ_TITLE_KEYS));
  const rawQuestions = firstValue(source, QUIZ_QUESTION_KEYS);
  if (!title || !Array.isArray(rawQuestions) || !rawQuestions.length) return null;
  const questions = rawQuestions.map(normalizeQuestion).filter(Boolean);
  if (!questions.length) return null;
  return {
    id: text(source.id || source.quiz_id || source.quizId),
    title,
    status: text(source.status) || 'DRAFT',
    difficulty: text(source.difficulty),
    questions,
  };
}

function balancedObjectAt(value, start) {
  let depth = 0;
  let quoted = false;
  let escaped = false;
  for (let index = start; index < value.length; index += 1) {
    const character = value[index];
    if (quoted) {
      if (escaped) escaped = false;
      else if (character === '\\') escaped = true;
      else if (character === '"') quoted = false;
      continue;
    }
    if (character === '"') quoted = true;
    else if (character === '{') depth += 1;
    else if (character === '}') {
      depth -= 1;
      if (depth === 0) return value.slice(start, index + 1);
    }
  }
  return '';
}

function jsonCandidates(content) {
  const value = text(content);
  if (!value) return [];
  const candidates = [];
  const fenced = /```(?:json)?\s*([\s\S]*?)```/gi;
  for (const match of value.matchAll(fenced)) candidates.push(match[1].trim());
  for (let index = value.indexOf('{'); index >= 0; index = value.indexOf('{', index + 1)) {
    const candidate = balancedObjectAt(value, index);
    if (candidate) candidates.push(candidate);
  }
  if (value.startsWith('{')) candidates.unshift(value);
  return [...new Set(candidates)].filter(candidate => candidate.length <= 250000);
}

export function parseQuizDraftContent(content, { logFailure = false } = {}) {
  const candidates = jsonCandidates(content);
  let lastError = null;
  for (const candidate of candidates) {
    try {
      const quiz = normalizeQuizDraftPayload(JSON.parse(candidate));
      if (quiz) return quiz;
    } catch (error) {
      lastError = error;
    }
  }
  if (logFailure && candidates.length && lastError && typeof console !== 'undefined') {
    console.warn('[QuizDraftPreview] Structured quiz payload could not be parsed.', {
      name: lastError.name,
      message: lastError.message,
      candidateLength: candidates[0].length,
    });
  }
  return null;
}

function canonicalQuizForMessage(message, quizzes) {
  const quizId = text(message?.quizId || message?.quiz?.id);
  if (quizId) {
    const match = quizzes.find(quiz => String(quiz.id) === quizId);
    if (match) return normalizeQuizDraftPayload(match);
  }
  if (message?.action === 'QUIZ_CREATED') return normalizeQuizDraftPayload(quizzes[0]);
  return null;
}

export function quizDraftPresentation(message, quizzes = []) {
  if (!message || message.role === 'USER') return null;
  const structuredContent = normalizeQuizDraftPayload(message.content);
  const parsed = structuredContent || parseQuizDraftContent(message.content, { logFailure: true });
  const direct = normalizeQuizDraftPayload(message.quiz)
    || normalizeQuizDraftPayload(message.structuredQuiz)
    || normalizeQuizDraftPayload(message.quizDraft);
  const canonical = canonicalQuizForMessage(message, Array.isArray(quizzes) ? quizzes : []);
  const quiz = canonical || direct || parsed;
  if (!quiz) return null;
  return {
    quiz,
    messageText: parsed ? 'Your quiz draft is ready.' : text(message.content) || 'Your quiz draft is ready.',
  };
}

export function quizQuestionTypeLabel(type) {
  const value = text(type).replaceAll('-', '_').replaceAll(' ', '_').toUpperCase();
  return {
    MULTIPLE_CHOICE: 'Multiple Choice',
    TRUE_FALSE: 'True or False',
    SHORT_ANSWER: 'Short Answer',
    PROBLEM_SOLVING: 'Solution Required',
  }[value] || 'Question';
}
