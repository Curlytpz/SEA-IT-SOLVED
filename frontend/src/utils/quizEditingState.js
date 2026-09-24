export function getQuizEditingState(status, editingPublishedQuiz = false) {
  const normalizedStatus = String(status || 'DRAFT').toUpperCase();
  const isDraft = normalizedStatus === 'DRAFT';
  const isPublished = normalizedStatus === 'PUBLISHED';
  const isDisabled = normalizedStatus === 'DISABLED';
  const isEditingPublishedQuiz = isPublished && Boolean(editingPublishedQuiz);

  return Object.freeze({
    status: normalizedStatus,
    isDraft,
    isPublished,
    isDisabled,
    isEditingPublishedQuiz,
    canEditQuiz: isDraft || isDisabled || isEditingPublishedQuiz,
    canPublishQuiz: isDraft,
    statusLabel: isEditingPublishedQuiz
      ? 'Published · Editing'
      : normalizedStatus.replaceAll('_', ' ').toLowerCase(),
  });
}
