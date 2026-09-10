import { normalizeGeneratedContent, normalizeStudentLessonContent } from './generatedContent.js';

const DIFFICULTY_WORDS = /\b(?:easy|medium|hard)\b/gi;
const INFLATED_WORDS = /\b(?:advanced|comprehensive|mastery|level)\b/gi;
const TITLE_SUFFIXES = /\b(?:quiz\s+)?assessment(?:\s+level)?\b/gi;
const SOURCE_WORDING = /\b(?:AI[- ]generated|according to|based on|from)\b[\s\S]*$/i;
const FILE_REFERENCE = /\b[^\s,;:()]+\.(?:png|jpe?g|pdf|docx?)\b/gi;

function cleanTopic(value) {
  return normalizeGeneratedContent(value)
    .replace(/^#{1,6}\s*/, '')
    .replace(/^(?:lesson|review)?\s*quiz\s*[:\-–—]?\s*/i, '')
    .replace(DIFFICULTY_WORDS, '')
    .replace(INFLATED_WORDS, '')
    .replace(TITLE_SUFFIXES, '')
    .replace(FILE_REFERENCE, '')
    .replace(SOURCE_WORDING, '')
    .replace(/[|_[\]{}]+/g, ' ')
    .replace(/\s+([,:;])/g, '$1')
    .replace(/^[\s:;,.\-–—]+|[\s:;,.\-–—]+$/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function conciseTopic(value) {
  const words = cleanTopic(value).split(/\s+/).filter(Boolean);
  return words.slice(0, 7).join(' ');
}

export function studentQuizTitle(title, lessonTitle = '') {
  let topic = conciseTopic(title);
  if (!topic || /^(?:quiz|assessment|lesson)$/i.test(topic)) topic = conciseTopic(lessonTitle);
  if (!topic) return 'Lesson Quiz';
  return `Quiz: ${topic}`;
}

export function studentQuizInstructions(instructions, questionCount) {
  const count = Number(questionCount);
  const fallback = Number.isFinite(count) && count > 0
    ? `Answer all ${count} questions.`
    : 'Answer all questions.';
  const cleaned = normalizeStudentLessonContent(instructions);
  if (!cleaned) return fallback;
  if (/\b(?:strictly|provided lesson (?:materials?|context)|source references?|uploaded|whiteboard|OCR)\b/i.test(cleaned)) return fallback;
  return cleaned;
}
