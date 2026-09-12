function quizIntent(message, explicit) {
  if (['GENERATE_QUIZ', 'QUIZ'].includes(explicit)) return true;
  return /\b(generate|create|make|build)\b[\s\S]{0,40}\b(quiz|questions?|problems?)\b|\bgive\s+(?:me|us)\b[\s\S]{0,40}\b(quiz|questions?|problems?)\b|\bquiz\b[\s\S]{0,30}\b(generate|create|make)\b/i.test(message);
}

const { quizEditIntent, explicitQuizGeneration } = require('../../../shared/quizEditTargeting.cjs');

function generateNotesIntent(message, explicit) {
  if (['GENERATE_NOTES', 'GENERATE_LESSON', 'REGENERATE_LESSON'].includes(explicit)) return true;
  return /\b(re-?generate|generate|create|prepare|build|draft)\b[\s\S]{0,48}\b(?:(?:lesson\s+)?(?:notes?|materials?|handout|document)|lesson)\b|\b(?:(?:lesson\s+)?(?:notes?|materials?|handout|document)|lesson)\b[\s\S]{0,32}\b(re-?generate|generate|create|prepare|build)\b/i.test(message);
}

function editIntent(message, explicit) {
  if (['CHAT_QUERY', 'ASK'].includes(explicit)) return 'ASK';
  if (['EDIT_LESSON', 'EDIT'].includes(explicit)) return 'EDIT';
  const mutation = /\b(make|shorten|rewrite|remove|delete|add|change|rename|fix|format|simplify|condense|concise|improve|update|expand)\b/i.test(message);
  const documentTarget = /\b(section|pages?|paragraph|lessons?|lesson\s+notes?|notes?|materials?|document|explanation|samples?|examples?|key\s+takeaways?|summary|common\s+mistakes?|reminders?|key\s+formulas?|formula\s+section|worked\s+examples?|concept\s+explanation|this\s+part|this\s+section|example\s+above)\b/i.test(message);
  return mutation && documentTarget ? 'EDIT' : 'ASK';
}

function wholeLessonEditIntent(message) {
  const text = String(message || '');
  return /\b(?:whole|entire|full)\s+(?:current\s+|existing\s+|generated\s+)?(?:lesson|document|lesson\s+notes?|lesson\s+materials?)\b|\ball\s+of\s+it\b|\b(?:all|everything)\s+(?:in\s+|from\s+|of\s+)?(?:the\s+)?(?:current\s+|existing\s+|generated\s+)?(?:lesson|document|lesson\s+notes?|lesson\s+materials?)\b/i.test(text);
}

const COUNT_WORDS = {
  one:1,two:2,three:3,four:4,five:5,six:6,seven:7,eight:8,nine:9,ten:10,
  eleven:11,twelve:12,thirteen:13,fourteen:14,fifteen:15,sixteen:16,
  seventeen:17,eighteen:18,nineteen:19,twenty:20,
};
const COUNT_TOKEN = `(?:\\d{1,3}|${Object.keys(COUNT_WORDS).join('|')})`;
const QUIZ_DIFFICULTIES = new Set(['EASY','MEDIUM','HARD']);
const QUIZ_QUESTION_TYPES = new Set(['MULTIPLE_CHOICE','PROBLEM_SOLVING','MIXED']);

function countValue(value) {
  const token = String(value || '').toLowerCase();
  return COUNT_WORDS[token] || Number(token);
}

function questionCount(message) {
  const text = String(message || '').trim();
  const standalone = text.match(new RegExp(`^${COUNT_TOKEN}$`, 'i'));
  if (standalone) return countValue(standalone[0]);
  const target = '(?:(?:easy|medium|hard)\\s+)?(?:(?:quiz\\s+)?(?:items?|questions?)|(?:multiple[-\\s]+choice|problem[-\\s]+solving)(?:\\s+(?:items?|questions?|problems?))?|problems?|quiz)';
  const match = text.match(new RegExp(`\\b(${COUNT_TOKEN})\\b(?=[\\s-]*${target}\\b)`, 'i'));
  return match ? countValue(match[1]) : undefined;
}

function quizDifficulty(message) {
  const match = String(message).match(/\b(easy|medium|hard)\b/i);
  return match ? match[1].toUpperCase() : undefined;
}

function quizQuestionType(message, count = questionCount(message)) {
  const text = String(message || '');
  const multipleChoice = /\b(?:multiple[-\s]+choice|mcqs?)\b/i.test(text);
  const problemSolving = /\b(?:problem[-\s]+solving|solution[-\s]+required)\b/i.test(text);
  if (!multipleChoice && !problemSolving) return undefined;
  if (multipleChoice && problemSolving) return 'MIXED';
  const positioned = /\bquestions?\s+(?:\d+(?:\s*(?:,|and|&)\s*\d+)*)\s+(?:(?:should|must)\s+be\s+)?(?:multiple[-\s]+choice|problem[-\s]+solving)\b/i.test(text);
  const quantified = text.match(new RegExp(`\\b(${COUNT_TOKEN})\\s+(?:multiple[-\\s]+choice|problem[-\\s]+solving)\\b`, 'i'));
  if (positioned || (quantified && Number.isInteger(count) && countValue(quantified[1]) !== count)) return 'MIXED';
  return problemSolving ? 'PROBLEM_SOLVING' : 'MULTIPLE_CHOICE';
}

function emptyQuizDraft() {
  return { questionCount:null, difficulty:null, questionType:null };
}

function mergeQuizDraft(base = {}, patch = {}) {
  const result = emptyQuizDraft();
  const apply = value => {
    if (value?.questionCount != null && value.questionCount !== '') result.questionCount = Number(value.questionCount);
    if (value?.difficulty != null && value.difficulty !== '') result.difficulty = String(value.difficulty).toUpperCase();
    if (value?.questionType != null && value.questionType !== '') result.questionType = String(value.questionType).toUpperCase().replace(/[\s-]+/g,'_');
  };
  apply(base); apply(patch);
  if (!QUIZ_DIFFICULTIES.has(result.difficulty)) result.difficulty = null;
  if (!QUIZ_QUESTION_TYPES.has(result.questionType)) result.questionType = null;
  return result;
}

function extractQuizParameters(message) {
  const count = questionCount(message);
  return {
    questionCount: count ?? null,
    difficulty: quizDifficulty(message) || null,
    questionType: quizQuestionType(message, count) || null,
  };
}

function prepareQuizDraft(message, current = {}, overrides = {}) {
  const extracted = extractQuizParameters(message);
  let draft = mergeQuizDraft(current, extracted);
  draft = mergeQuizDraft(draft, overrides);
  const requestedCount = overrides.questionCount != null && overrides.questionCount !== ''
    ? Number(overrides.questionCount)
    : extracted.questionCount;
  const invalidQuestionCount = requestedCount != null && (!Number.isInteger(requestedCount) || requestedCount < 1 || requestedCount > 20)
    ? requestedCount : null;
  if (invalidQuestionCount != null || !Number.isInteger(draft.questionCount) || draft.questionCount < 1 || draft.questionCount > 20) draft.questionCount = null;
  const missingParameters = ['questionCount','difficulty','questionType'].filter(key => draft[key] == null);
  return { draft, missingParameters, invalidQuestionCount };
}

function quizClarificationMessage(missingParameters, invalidQuestionCount = null) {
  const missing = new Set(missingParameters);
  if (missing.size === 1 && missing.has('difficulty')) return 'What difficulty would you like?';
  if (missing.size === 1 && missing.has('questionCount')) return `${invalidQuestionCount != null ? 'Quiz generation supports 1–20 questions. ' : ''}How many questions would you like? Choose from 1 to 20.`;
  if (missing.size === 1 && missing.has('questionType')) return 'Which question type would you like: multiple choice or problem solving?';
  const labels = [
    missing.has('difficulty') && 'difficulty',
    missing.has('questionCount') && 'number of questions (1–20)',
    missing.has('questionType') && 'question type',
  ].filter(Boolean);
  const final = labels.pop();
  const requested = labels.length ? `${labels.join(', ')} and ${final}` : final;
  return `${invalidQuestionCount != null ? 'Quiz generation supports 1–20 questions. ' : ''}Please choose the ${requested}.`;
}

function isQuizDraftContinuation(message) {
  const text = String(message || '').trim();
  const extracted = extractQuizParameters(text);
  if (!Object.values(extracted).some(value => value != null)) return false;
  if (new RegExp(`^(?:actually\\s+)?(?:make\\s+it\\s+)?(?:${COUNT_TOKEN}|easy|medium|hard|multiple[-\\s]+choice|mcqs?|problem[-\\s]+solving)(?:\\s+please)?[.!?]*$`, 'i').test(text)) return true;
  return /\b(?:quiz|questions?|items?|difficulty|multiple[-\s]+choice|mcqs?|problem[-\s]+solving|solution[-\s]+required)\b/i.test(text);
}

module.exports = {
  explicitQuizGeneration, quizIntent, quizEditIntent, generateNotesIntent, editIntent, wholeLessonEditIntent,
  questionCount, quizDifficulty, quizQuestionType, extractQuizParameters, emptyQuizDraft,
  mergeQuizDraft, prepareQuizDraft, quizClarificationMessage, isQuizDraftContinuation,
};
