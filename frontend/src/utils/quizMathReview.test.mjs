import assert from 'node:assert/strict';
import test from 'node:test';
import { getQuizMathIssues, getQuizQuestionMathIssues, hasUnresolvedQuizMath } from './quizMathReview.js';

const validQuestion = {
  id: 'question-1',
  type: 'MULTIPLE_CHOICE',
  prompt: 'Evaluate $\\frac{1}{x}$.',
  choices: ['$1$', '$2$', '$3$', '$4$'],
  correctAnswer: '$1$',
  explanation: 'Use $\\sqrt{x}$ only when appropriate.',
};

test('quiz with valid LaTeX has no unresolved math review', () => {
  const quiz = { questions: [validQuestion] };
  assert.deepEqual(getQuizMathIssues(quiz), []);
  assert.equal(hasUnresolvedQuizMath(quiz), false);
});

test('invalid LaTeX identifies the exact question and field', () => {
  const quiz = { questions: [{ ...validQuestion, explanation: 'Because $\\frac{1}{$.' }] };
  const issues = getQuizMathIssues(quiz);
  assert.equal(issues.length, 1);
  assert.equal(issues[0].questionLabel, 'Question 1');
  assert.equal(issues[0].field, 'explanation');
  assert.equal(issues[0].label, 'Answer explanation');
  assert.equal(issues[0].reason, 'Invalid LaTeX expression');
});

test('correcting and saving a field clears its derived review state', () => {
  const invalid = { ...validQuestion, prompt: 'Evaluate $\\sqrt{$.' };
  assert.equal(getQuizQuestionMathIssues(invalid).length, 1);
  assert.equal(getQuizQuestionMathIssues({ ...invalid, prompt: 'Evaluate $\\sqrt{x}$.' }).length, 0);
});

test('multiple invalid fields keep review active until every field is fixed', () => {
  const invalid = { ...validQuestion, prompt: '$\\sqrt{$', explanation: '$\\frac{1}{$' };
  assert.equal(getQuizQuestionMathIssues(invalid).length, 2);
  assert.equal(getQuizQuestionMathIssues({ ...invalid, prompt: '$\\sqrt{x}$' }).length, 1);
  assert.equal(getQuizQuestionMathIssues({ ...invalid, prompt: '$\\sqrt{x}$', explanation: '$\\frac{1}{x}$' }).length, 0);
});

test('problem-solving math fields participate in the same review state', () => {
  const question = {
    id: 'question-2',
    type: 'PROBLEM_SOLVING',
    prompt: 'Show your work for $x^2$.',
    problemSettings: { instructions: '', rubric: 'Award credit for $\\frac{1}{$', tip: '', formula: '' },
  };
  const [issue] = getQuizQuestionMathIssues(question);
  assert.equal(issue.field, 'problemSettings.rubric');
  assert.equal(issue.label, 'Expected solution / rubric');
});

test('publishing is unblocked whenever no unresolved review issue remains', () => {
  assert.equal(hasUnresolvedQuizMath({ questions: [validQuestion] }), false);
  assert.equal(hasUnresolvedQuizMath({ questions: [{ ...validQuestion, choices: ['$\\sqrt{$', '$2$', '$3$', '$4$'] }] }), true);
});
