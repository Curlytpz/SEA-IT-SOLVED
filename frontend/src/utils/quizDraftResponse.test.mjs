import assert from 'node:assert/strict';
import {
  normalizeQuizDraftPayload,
  parseQuizDraftContent,
  quizDraftPresentation,
  quizQuestionTypeLabel,
} from './quizDraftResponse.js';

const payload = {
  title: 'BASIC LANG TO LODS QUIZ',
  questions: [
    {
      question_number: 1,
      question_text: 'Evaluate $\\lim_{x\\to 1^-} P(x)$.',
      options: ['0.49', '0.86', '1', 'DNE'],
      correct_answer: '0.49',
      explanation: 'Use the left-hand branch.',
    },
    {
      question_number: 2,
      question_text: 'Simplify $\\frac{1}{x}$.',
      options: ['A', 'B', 'C', 'D'],
      correct_answer: 'A',
      explanation: 'A hidden answer that must not be required by the preview.',
    },
  ],
};

const normalized = normalizeQuizDraftPayload(payload);
assert.equal(normalized.title, payload.title);
assert.equal(normalized.questions.length, 2);
assert.equal(normalized.questions[0].type, 'MULTIPLE_CHOICE');
assert.equal(normalized.questions[0].prompt, payload.questions[0].question_text);

assert.deepEqual(parseQuizDraftContent(JSON.stringify(payload)), normalized);
assert.deepEqual(parseQuizDraftContent(`\`\`\`json\n${JSON.stringify(payload)}\n\`\`\``), normalized);
assert.deepEqual(parseQuizDraftContent(`Your draft is ready.\n${JSON.stringify(payload)}\nReview it.`), normalized);
assert.equal(parseQuizDraftContent('{"title":"Incomplete","questions":['), null);
assert.equal(parseQuizDraftContent('{"status":"ok"}'), null);
assert.equal(parseQuizDraftContent('A normal assistant response.'), null);

const canonical = { ...normalized, id: 'quiz-1', title: 'Persisted title' };
const presentation = quizDraftPresentation({ role: 'ASSISTANT', action: 'QUIZ_CREATED', content: 'Quiz generated.', quizId: 'quiz-1' }, [canonical]);
assert.equal(presentation.quiz.title, 'Persisted title');
assert.equal(presentation.messageText, 'Quiz generated.');

const rawPresentation = quizDraftPresentation({ role: 'ASSISTANT', content: JSON.stringify(payload) }, []);
assert.equal(rawPresentation.messageText, 'Your quiz draft is ready.');
assert.equal(rawPresentation.quiz.title, payload.title);
const objectPresentation = quizDraftPresentation({ role: 'ASSISTANT', content: payload }, []);
assert.equal(objectPresentation.messageText, 'Your quiz draft is ready.');
assert.equal(objectPresentation.quiz.questions.length, 2);
assert.equal(quizQuestionTypeLabel('problem_solving'), 'Solution Required');

console.log('QUIZ DRAFT RESPONSE PRESENTATION: PASS');
