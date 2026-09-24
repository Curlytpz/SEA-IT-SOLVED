function number(value) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

export function lessonQuizStatus(lesson) {
  const pending = number(lesson?.pendingQuizzes);
  const awaitingReview = number(lesson?.awaitingReviewQuizzes);
  const completed = number(lesson?.completedQuizzes);
  const total = number(lesson?.totalQuizzes);

  if (pending > 0) return `${pending} ${pending === 1 ? 'quiz' : 'quizzes'} to answer`;
  if (awaitingReview > 0) return `${awaitingReview} ${awaitingReview === 1 ? 'quiz' : 'quizzes'} awaiting review`;
  if (completed > 0) return `${completed} ${completed === 1 ? 'quiz' : 'quizzes'} completed`;
  if (total > 0) return `${total} ${total === 1 ? 'quiz' : 'quizzes'} currently unavailable`;
  return 'No quiz';
}

export function summarizeClassLessons(lessons = []) {
  return lessons.reduce((summary, lesson) => {
    summary.lessonCount += 1;
    summary.pendingQuizzes += number(lesson.pendingQuizzes);
    summary.completedQuizzes += number(lesson.completedQuizzes);
    summary.awaitingReviewQuizzes += number(lesson.awaitingReviewQuizzes);
    summary.totalQuizzes += number(lesson.totalQuizzes);
    return summary;
  }, {
    lessonCount: 0,
    pendingQuizzes: 0,
    completedQuizzes: 0,
    awaitingReviewQuizzes: 0,
    totalQuizzes: 0,
  });
}

export function classQuizStatus(summary) {
  if (summary.pendingQuizzes > 0) {
    return `${summary.pendingQuizzes} ${summary.pendingQuizzes === 1 ? 'quiz' : 'quizzes'} to answer`;
  }
  if (summary.awaitingReviewQuizzes > 0) {
    return `${summary.awaitingReviewQuizzes} ${summary.awaitingReviewQuizzes === 1 ? 'quiz' : 'quizzes'} awaiting review`;
  }
  if (summary.totalQuizzes > 0 && summary.completedQuizzes === summary.totalQuizzes) return 'All quizzes completed';
  if (summary.completedQuizzes > 0) {
    return `${summary.completedQuizzes} ${summary.completedQuizzes === 1 ? 'quiz' : 'quizzes'} completed`;
  }
  return 'No quizzes available';
}

export function buildStudentClassGroups(enrollments = [], lessons = []) {
  const groups = new Map();

  for (const enrollment of enrollments) {
    if (enrollment?.enrollmentStatus !== 'APPROVED' || !enrollment?.section?.id) continue;
    const section = enrollment.section;
    groups.set(section.id, {
      id: section.id,
      subjectCode: section.subjectCode,
      subjectName: section.subjectName,
      sectionName: section.sectionName,
      instructorName: section.instructorName,
      instructorStatus: section.instructorStatus,
      enrollmentId: enrollment.enrollmentId,
      lessons: [],
    });
  }

  for (const lesson of lessons) {
    const section = lesson?.section;
    if (!section?.id) continue;
    if (!groups.has(section.id)) {
      groups.set(section.id, {
        id: section.id,
        subjectCode: section.subjectCode,
        subjectName: section.subjectName,
        sectionName: section.name,
        instructorName: section.instructorName,
        instructorStatus: 'ACTIVE',
        enrollmentId: null,
        lessons: [],
      });
    }
    groups.get(section.id).lessons.push(lesson);
  }

  return [...groups.values()].map(group => ({
    ...group,
    latestLesson: group.lessons[0] || null,
    summary: summarizeClassLessons(group.lessons),
  }));
}
