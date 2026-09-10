export function lessonPrimaryAction(lesson) {
  const workflow = lesson.workflow || {};
  const base = `/instructor/lessons/${lesson.id}`;
  if (workflow.context?.status === 'DRAFT') return { label: 'Review Context', to: `${base}/review` };
  if (workflow.context?.status === 'APPROVED' || workflow.hasGeneratedMaterials || workflow.hasPublishedMaterials) {
    return { label: 'Open Lesson Workspace', to: `${base}/review?view=workspace` };
  }
  if ([workflow.recognitionStatus, workflow.transcriptionStatus].includes('REVIEW_REQUIRED') || workflow.uploadsReady) {
    const processing = [workflow.recognitionStatus, workflow.transcriptionStatus].some(status => ['PENDING', 'PROCESSING'].includes(status)) || workflow.uploadsProcessing;
    if (!processing) return { label: 'Review Context', to: `${base}/review` };
  }
  return {
    label: workflow.recognitionStatus || workflow.transcriptionStatus || workflow.hasUploads ? 'Continue Processing' : 'Process Lesson',
    to: `${base}/processing`,
  };
}

export function formatLessonDuration(ms) {
  if (ms == null || !Number.isFinite(Number(ms))) return '—';
  const seconds = Math.max(0, Math.round(Number(ms) / 1000));
  if (seconds < 60) return `${seconds || (Number(ms) > 0 ? '<1' : 0)} sec`;
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor(seconds / 60) % 60;
  const remainder = seconds % 60;
  return [hours ? `${hours} hr` : '', minutes ? `${minutes} min` : '', remainder ? `${remainder} sec` : ''].filter(Boolean).join(' ');
}
