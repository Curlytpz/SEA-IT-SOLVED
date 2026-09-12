const SUBMITTED_ATTEMPT_STATUSES = new Set(['SUBMITTED', 'GRADED']);

function deriveStudentQuizState({ quizStatus, attemptStatus = null }) {
  const published = quizStatus === 'PUBLISHED';

  if (attemptStatus === 'GRADED') {
    return {
      studentStatus: 'GRADED',
      canAttempt: false,
      awaitingReview: false,
      resultReleased: true,
      submitted: true,
      action: 'VIEW_RESULTS',
    };
  }

  if (attemptStatus === 'SUBMITTED') {
    return {
      studentStatus: 'SUBMITTED_AWAITING_REVIEW',
      canAttempt: false,
      awaitingReview: true,
      resultReleased: false,
      submitted: true,
      action: 'VIEW_SUBMISSION',
    };
  }

  if (attemptStatus === 'IN_PROGRESS' && published) {
    return {
      studentStatus: 'IN_PROGRESS',
      canAttempt: true,
      awaitingReview: false,
      resultReleased: false,
      submitted: false,
      action: 'RESUME',
    };
  }

  if (!attemptStatus && published) {
    return {
      studentStatus: 'AVAILABLE',
      canAttempt: true,
      awaitingReview: false,
      resultReleased: false,
      submitted: false,
      action: 'ANSWER',
    };
  }

  return {
    studentStatus: 'UNAVAILABLE',
    canAttempt: false,
    awaitingReview: false,
    resultReleased: false,
    submitted: SUBMITTED_ATTEMPT_STATUSES.has(attemptStatus),
    action: 'NONE',
  };
}

function summarizeStudentQuizzes(quizzes) {
  return quizzes.reduce((summary, quiz) => {
    summary.totalQuizzes += 1;
    if (quiz.canAttempt) summary.pendingQuizzes += 1;
    if (quiz.submitted) summary.submittedQuizzes += 1;
    if (quiz.awaitingReview) summary.awaitingReviewQuizzes += 1;
    if (quiz.resultReleased) summary.gradedQuizzes += 1;
    return summary;
  }, {
    totalQuizzes: 0,
    pendingQuizzes: 0,
    submittedQuizzes: 0,
    completedQuizzes: 0,
    awaitingReviewQuizzes: 0,
    gradedQuizzes: 0,
  });
}

function finalizeStudentQuizSummary(summary) {
  return { ...summary, completedQuizzes: summary.submittedQuizzes };
}

module.exports = {
  deriveStudentQuizState,
  summarizeStudentQuizzes: quizzes => finalizeStudentQuizSummary(summarizeStudentQuizzes(quizzes)),
};
