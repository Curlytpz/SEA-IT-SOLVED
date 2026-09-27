import { normalizeLessonMathContent } from './mathContent.js';

const REVIEW_REASONS = Object.freeze({
  KATEX_PARSE_ERROR: 'Invalid LaTeX expression',
});

function fieldIssues(value, field, label) {
  return normalizeLessonMathContent(value).needsReview.map(issue => ({
    field,
    label,
    code: issue.reason || 'MATH_VALIDATION_FAILED',
    reason: REVIEW_REASONS[issue.reason] || 'Math validation failed',
  }));
}

export function getQuizQuestionMathIssues(question = {}) {
  const issues = [...fieldIssues(question.prompt, 'prompt', 'Question stem')];
  if (!['SHORT_ANSWER', 'PROBLEM_SOLVING'].includes(question.type)) {
    (question.choices || []).forEach((choice, index) => {
      issues.push(...fieldIssues(choice, `choices.${index}`, `Choice ${String.fromCharCode(65 + index)}`));
    });
  }
  if (question.type !== 'PROBLEM_SOLVING') {
    issues.push(...fieldIssues(question.correctAnswer, 'correctAnswer', 'Correct answer'));
    issues.push(...fieldIssues(question.explanation, 'explanation', 'Answer explanation'));
  } else {
    const settings = question.problemSettings || {};
    issues.push(...fieldIssues(settings.instructions, 'problemSettings.instructions', 'Solution instructions'));
    issues.push(...fieldIssues(settings.rubric, 'problemSettings.rubric', 'Expected solution / rubric'));
    issues.push(...fieldIssues(settings.tip, 'problemSettings.tip', 'Tip'));
    issues.push(...fieldIssues(settings.formula, 'problemSettings.formula', 'Formula'));
  }
  return issues;
}

export function getQuizMathIssues(quiz = {}) {
  return (quiz.questions || []).flatMap((question, questionIndex) =>
    getQuizQuestionMathIssues(question).map(issue => ({
      ...issue,
      questionId: question.id,
      questionIndex,
      questionLabel: `Question ${questionIndex + 1}`,
    }))
  );
}

export function hasUnresolvedQuizMath(quiz) {
  return getQuizMathIssues(quiz).length > 0;
}
