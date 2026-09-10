function quizIntent(message, explicit) {
  if (['GENERATE_QUIZ', 'QUIZ'].includes(explicit)) return true;
  return /\b(generate|create|make|build)\b[\s\S]{0,40}\b(quiz|questions?)\b|\bquiz\b[\s\S]{0,30}\b(generate|create|make)\b/i.test(message);
}

const { quizEditIntent, explicitQuizGeneration } = require('../../../shared/quizEditTargeting.cjs');

function generateNotesIntent(message, explicit) {
  if (['GENERATE_NOTES', 'GENERATE_LESSON', 'REGENERATE_LESSON'].includes(explicit)) return true;
  return /\b(re-?generate|generate|create|prepare|build|draft)\b[\s\S]{0,48}\b(lesson\s+)?(notes?|materials?|handout)\b|\b(lesson\s+)?(notes?|materials?|handout)\b[\s\S]{0,32}\b(re-?generate|generate|create|prepare|build)\b/i.test(message);
}

function editIntent(message, explicit) {
  if (['CHAT_QUERY', 'ASK'].includes(explicit)) return 'ASK';
  if (['EDIT_LESSON', 'EDIT'].includes(explicit)) return 'EDIT';
  const mutation = /\b(make|shorten|rewrite|remove|delete|add|change|rename|fix|format|simplify|condense|concise|improve|update|expand)\b/i.test(message);
  const documentTarget = /\b(section|lessons?|lesson\s+notes?|notes?|materials?|document|explanation|samples?|examples?|key\s+takeaways?|summary|common\s+mistakes?|reminders?|key\s+formulas?|formula\s+section|worked\s+examples?|concept\s+explanation|this\s+part|this\s+section|example\s+above)\b/i.test(message);
  return mutation && documentTarget ? 'EDIT' : 'ASK';
}

function questionCount(message) {
  const match = String(message).match(/\b(\d{1,2})\b(?=[\s\S]{0,30}\b(?:quiz\s+)?(?:item|question)s?\b)/i);
  return match ? Number(match[1]) : undefined;
}

function quizDifficulty(message) {
  const match = String(message).match(/\b(easy|medium|hard)\b/i);
  return match ? match[1].toUpperCase() : undefined;
}

module.exports = { explicitQuizGeneration, quizIntent, quizEditIntent, generateNotesIntent, editIntent, questionCount, quizDifficulty };
