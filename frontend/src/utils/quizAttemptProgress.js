export function isQuestionAnswered(question) {
  return question.type === 'PROBLEM_SOLVING' ? Boolean(question.solution) : Boolean(String(question.answer ?? '').trim());
}
export function quizAttemptProgress(questions = []) {
  const unanswered = questions.flatMap((question, index) => isQuestionAnswered(question) ? [] : [index]);
  const answered = questions.length - unanswered.length;
  return { answered, unanswered, percent: questions.length ? Math.round(answered / questions.length * 100) : 0 };
}
