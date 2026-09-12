const assert = require('node:assert/strict');
const { deriveStudentQuizState, summarizeStudentQuizzes } = require('./studentQuizState');

const available = deriveStudentQuizState({ quizStatus: 'PUBLISHED' });
assert.deepEqual({ status: available.studentStatus, canAttempt: available.canAttempt, action: available.action },
  { status: 'AVAILABLE', canAttempt: true, action: 'ANSWER' });

const inProgress = deriveStudentQuizState({ quizStatus: 'PUBLISHED', attemptStatus: 'IN_PROGRESS' });
assert.deepEqual({ status: inProgress.studentStatus, canAttempt: inProgress.canAttempt, action: inProgress.action },
  { status: 'IN_PROGRESS', canAttempt: true, action: 'RESUME' });

const awaitingReview = deriveStudentQuizState({ quizStatus: 'PUBLISHED', attemptStatus: 'SUBMITTED' });
assert.deepEqual({ status: awaitingReview.studentStatus, canAttempt: awaitingReview.canAttempt, awaitingReview: awaitingReview.awaitingReview, resultReleased: awaitingReview.resultReleased },
  { status: 'SUBMITTED_AWAITING_REVIEW', canAttempt: false, awaitingReview: true, resultReleased: false });

const graded = deriveStudentQuizState({ quizStatus: 'PUBLISHED', attemptStatus: 'GRADED' });
assert.deepEqual({ status: graded.studentStatus, canAttempt: graded.canAttempt, resultReleased: graded.resultReleased, action: graded.action },
  { status: 'GRADED', canAttempt: false, resultReleased: true, action: 'VIEW_RESULTS' });

const unavailable = deriveStudentQuizState({ quizStatus: 'DISABLED' });
assert.deepEqual({ status: unavailable.studentStatus, canAttempt: unavailable.canAttempt },
  { status: 'UNAVAILABLE', canAttempt: false });

const summary = summarizeStudentQuizzes([available, awaitingReview, graded]);
assert.deepEqual(summary, {
  totalQuizzes: 3,
  pendingQuizzes: 1,
  submittedQuizzes: 2,
  completedQuizzes: 2,
  awaitingReviewQuizzes: 1,
  gradedQuizzes: 1,
});

console.log('STUDENT QUIZ STATE: PASS');
