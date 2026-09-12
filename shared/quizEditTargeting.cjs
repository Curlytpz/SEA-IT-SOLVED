// Shared routing precedence; targeted edit planning remains independent.
const ordinalNumbers = { first: 1, second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6, seventh: 7, eighth: 8, ninth: 9, tenth: 10 };
const countNumbers = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };
const reference = `(?:second(?:\\s+|-)+to(?:\\s+|-)+last|${Object.keys(ordinalNumbers).join('|')}|last|final|\\d+(?:st|nd|rd|th)?)`;
const prefix = '(?:(?:questions?|q)\\s*(?:(?:numbers?|no\\.?)\\s*|#\\s*)?|number\\s+)';
const separator = '(?:\\s*,\\s*(?:and\\s+)?|\\s+(?:and|&)\\s+)';
const sequence = `${reference}(?:${separator}(?:${prefix})?${reference})*`;

function questionReferences(message, questionCount) {
  const text = String(message || '');
  const numbers = [];
  let present = false;
  const total = Number(questionCount);
  const resolve = value => {
    const token = value.toLowerCase();
    if (/^second(?:\s+|-)+to(?:\s+|-)+last$/.test(token)) return Number.isInteger(total) ? total - 1 : null;
    if (token === 'last' || token === 'final') return Number.isInteger(total) ? total : null;
    return ordinalNumbers[token] || parseInt(token, 10);
  };
  const collect = value => {
    present = true;
    for (const match of value.matchAll(new RegExp(`\\b${reference}\\b`, 'gi'))) {
      const number = resolve(match[0]);
      if (number != null && Number.isFinite(number)) numbers.push(number);
    }
  };
  for (const match of text.matchAll(new RegExp(`\\b${prefix}(${sequence})\\b`, 'gi'))) collect(match[1]);
  // A bare count before "questions" is a generation count, not an edit target.
  const ordinalSequence = sequence.replaceAll('(?:st|nd|rd|th)?', '(?:st|nd|rd|th)');
  for (const match of text.matchAll(new RegExp(`\\b(${ordinalSequence})\\s+questions?\\b`, 'gi'))) collect(match[1]);
  for (const match of text.matchAll(/\b(first|last|final)\s+(\d+|one|two|three|four|five|six|seven|eight|nine|ten)\s+questions\b/gi)) {
    present = true;
    const count = countNumbers[match[2].toLowerCase()] || Number(match[2]);
    if (Number.isInteger(total) && count > 0 && count <= 20) {
      numbers.push(...Array.from({ length: count }, (_, index) => match[1].toLowerCase() === 'first' ? index + 1 : total - count + index + 1));
    } else if (count > 20) numbers.push(0); // Reject oversized target sets; never truncate and partially apply.
  }
  return { present, numbers: [...new Set(numbers)].sort((a, b) => a - b) };
}

function isQuizEditFollowup(message) {
  if (/\b(?:tip|hint|formula)\b/i.test(message) && requestedQuizChange(message)) return true;
  return /\b(?:it|them|those\s+questions?|these\s+questions?)\b|\bwhat\s+about\b|\byou\s+forgot\b|\bdo\s+(?:question|number|the)\b|\balso\b|\btoo\s*[?.!]*$/i.test(message);
}

function requestedQuizChange(message) {
  if (/\b(?:problem[-\s]+solving|solution[-\s]+required)\b/i.test(message)) return 'problem_solving';
  const help = /\bformula\b/i.test(message) ? 'formula' : /\b(?:tip|hint)\b/i.test(message) ? 'tip' : null;
  if (help) {
    if (/\b(?:disable|off)\b/i.test(message)) return 'disable_' + help;
    if (/\b(?:enable|on)\b/i.test(message)) return 'enable_' + help;
    if (help === 'tip' && /\bless\s+revealing\b/i.test(message)) return 'less_revealing_tip';
    if (/\b(?:generate|regenerate|change|rewrite|update|edit|make)\b/i.test(message)) return 'generate_' + help;
  }
  if (/\b(?:harder|more\s+(?:challenging|difficult))\b/i.test(message)) return 'harder';
  if (/\b(?:easier|less\s+(?:challenging|difficult))\b/i.test(message)) return 'easier';
  if (/\bmultiple[-\s]+choice\b/i.test(message)) return 'multiple_choice';
  if (/\btrue\s*(?:\/|or|-)?\s*false\b/i.test(message)) return 'true_false';
  if (/\bshort[-\s]+answer\b/i.test(message)) return 'short_answer';
  return null;
}

function explicitQuizGeneration(message) {
  const text = String(message || '');
  // Existing "create new questions instead" means whole-quiz replacement, not a second draft.
  if (/\bcreate\b[\s\S]{0,30}\bnew\b[\s\S]{0,20}\bquestions?\b[\s\S]{0,15}\binstead\b/i.test(text)) return false;
  const number = '(?:\\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty)';
  const questionType = '(?:multiple[-\\s]+choice|problem[-\\s]+solving|solution[-\\s]+required|true\\s*(?:/|or|-)\\s*false)';
  const modifiers = `(?:(?:a|an|new|another|easy|medium|hard|${questionType})\\s+)*`;
  const count = `(?:${number}(?:[-\\s]+(?:items?|questions?|problems?))?\\s+)?`;
  const quiz = new RegExp('\\b(?:generate|create|build|make)\\s+(?:(?:me|us)\\s+)?' + modifiers + count + modifiers + 'quiz\\b(?!\\s*(?:number\\s*|#\\s*)?\\d)', 'i');
  const questions = new RegExp(`\\b(?:generate|create|build|make)\\s+(?:(?:me|us)\\s+)?(?:new\\s+)?${number}[-\\s]+(?:(?:easy|medium|hard|${questionType})\\s+)*(?:items?|questions?|problems?)\\b`, 'i');
  return quiz.test(text) || questions.test(text);
}

function quizEditIntent(message, explicit) {
  if (explicitQuizGeneration(message)) return false;
  if (explicit === 'EDIT_QUIZ') return true;
  const text = String(message || '');
  const references = questionReferences(text);
  if (/\b(?:tip|hint|formula)\b/i.test(text) && requestedQuizChange(text)) return true;
  if (references.present && /\b(?:edit|change|rewrite|replace|remove|delete|make|turn|move|reorder|swap|update|fix|harder|easier|do|forgot)\b|\bwhat\s+about\b/i.test(text)) return true;
  if (/\b(?:make|change|turn|update)\s+(?:it|them|those\s+questions|these\s+questions)\b/i.test(text) && requestedQuizChange(text)) return true;
  return /\b(?:edit|change|rewrite|replace|remove|delete|add|make|turn|move|reorder|swap)\b[\s\S]{0,70}\b(?:quiz\s*\d*|question(?:\s+(?:number|#))?\s*\d+|(?:first|last|final|second(?:\s+|-)+to(?:\s+|-)+last)\s+question|another\s+question|choices?|answer options?)\b|\bquiz\s*\d+[\s\S]{0,70}\b(?:question|choices?|harder|difficult|remove|add|rewrite|replace|regenerate)\b|\b(?:regenerate|replace|rewrite)\b[\s\S]{0,30}\b(?:whole|entire|all)\b[\s\S]{0,20}\bquiz\b|\bcreate\b[\s\S]{0,30}\bnew\b[\s\S]{0,20}\bquestions?\b[\s\S]{0,15}\binstead\b|\bmake\s+it\s+(?:harder|easier)\b/i.test(text);
}

function quizEditPlan(message, { questionCount, recentQuestionNumber, recentQuestionNumbers = [], recentQuizNumber, recentRequestedChange, recentChangeInstruction } = {}) {
  const text = String(message || '');
  const quizMatch = text.match(/\bquiz(?:\s+(?:number|#))?\s*(\d+)\b/i);
  const followup = isQuizEditFollowup(text);
  const quizNumber = quizMatch ? Number(quizMatch[1]) : (followup && Number(recentQuizNumber)) || 1;
  const references = questionReferences(text, questionCount);
  let targetQuestionNumbers = references.numbers;
  if (!references.present && followup) {
    const recent = recentQuestionNumbers.length ? recentQuestionNumbers : recentQuestionNumber ? [recentQuestionNumber] : [];
    targetQuestionNumbers = /\bit\b/i.test(text) ? recent.slice(0, 1) : recent;
  }
  targetQuestionNumbers = [...new Set(targetQuestionNumbers.map(Number))].sort((a, b) => a - b);
  const currentChange = requestedQuizChange(text);
  const implicitChange = /\bwhat\s+about\b|\byou\s+forgot\b|^\s*do\s+.*\btoo\b/i.test(text);
  const requestedChange = currentChange || (implicitChange ? recentRequestedChange || null : 'custom');
  const changeInstruction = currentChange ? currentChange : implicitChange ? recentChangeInstruction || recentRequestedChange || '' : text;
  const plan = { quizNumber, targetQuestionNumbers, requestedQuestionCount: null, requestedChange, changeInstruction, usesRecentTargets: !references.present && followup };
  if (/\b(?:regenerate|rewrite)\b[\s\S]{0,25}\b(?:whole|entire|all)\b[\s\S]{0,20}\bquiz\b|\breplace\b[\s\S]{0,12}\ball\b[\s\S]{0,15}\bquiz\s+questions?\b|\bcreate\b[\s\S]{0,30}\bnew\b[\s\S]{0,20}\bquestions?\b[\s\S]{0,15}\binstead\b/i.test(text)) {
    return { ...plan, operation: 'regenerate_quiz', targetQuestionNumbers: [], requestedQuestionCount: Number(text.match(/\b(\d{1,2})[-\s]+questions?\b/i)?.[1]) || null };
  }
  if (/\b(?:delete|remove)\b/i.test(text) && targetQuestionNumbers.length === 1) return { ...plan, operation: 'delete_question' };
  if (/\badd\b[\s\S]{0,25}\b(?:another|new|one)?\s*question\b/i.test(text)) return { ...plan, operation: 'add_question', targetQuestionNumbers: [] };
  if (/\b(?:move|reorder|swap)\b/i.test(text)) return { ...plan, operation: 'reorder_questions' };
  return { ...plan, operation: targetQuestionNumbers.length > 1 ? 'update_multiple_questions' : targetQuestionNumbers.length === 1 ? 'update_question' : 'clarify' };
}

const quizEditTargetingApi = { explicitQuizGeneration, quizEditIntent, quizEditPlan, requestedQuizChange };
if (typeof module !== 'undefined' && module.exports) module.exports = quizEditTargetingApi;
if (typeof globalThis !== 'undefined') globalThis[Symbol.for('sea-it-solved.quizEditTargeting')] = quizEditTargetingApi;
