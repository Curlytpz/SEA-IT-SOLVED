const RUNNING_STATUSES = new Set(['PENDING', 'PROCESSING', 'UPLOADED']);
const READY_STATUSES = new Set(['REVIEW_REQUIRED', 'APPROVED', 'SUCCEEDED']);

function normalizedStatus(value) {
  return String(value || '').trim().toUpperCase();
}

export function lessonContextReadiness(lesson) {
  const workflow = lesson?.workflow || {};
  const recognitionStatus = normalizedStatus(workflow.recognitionStatus);
  const transcriptionStatus = normalizedStatus(workflow.transcriptionStatus);
  const contextStatus = normalizedStatus(workflow.context?.status);
  const processingSources = [];
  const failedSources = [];

  if (RUNNING_STATUSES.has(recognitionStatus)) processingSources.push('whiteboard recognition');
  if (RUNNING_STATUSES.has(transcriptionStatus)) processingSources.push('audio transcription');
  if (workflow.uploadsProcessing) processingSources.push('uploaded materials');
  if (recognitionStatus === 'FAILED') failedSources.push('whiteboard recognition');
  if (transcriptionStatus === 'FAILED') failedSources.push('audio transcription');
  if (workflow.hasUploads && !workflow.uploadsProcessing && !workflow.uploadsReady) failedSources.push('uploaded materials');

  const hasContext = contextStatus === 'DRAFT' || contextStatus === 'APPROVED';
  const hasReadySource = READY_STATUSES.has(recognitionStatus)
    || READY_STATUSES.has(transcriptionStatus)
    || Boolean(workflow.uploadsReady);
  const processing = processingSources.length > 0;
  const canPrepare = lesson?.status === 'COMPLETED' && !processing && (hasContext || hasReadySource);
  const signature = [
    lesson?.id || 'NO_LESSON',
    normalizedStatus(lesson?.status) || 'NO_STATUS',
    workflow.context?.id || 'NO_CONTEXT',
    contextStatus || 'NO_CONTEXT_STATUS',
    workflow.context?.versionNumber || 0,
    recognitionStatus || 'NO_RECOGNITION',
    transcriptionStatus || 'NO_TRANSCRIPTION',
    workflow.uploadsProcessing ? 1 : 0,
    workflow.uploadsReady ? 1 : 0,
    workflow.hasUploads ? 1 : 0,
  ].join('|');

  return {
    canPrepare,
    failedSources,
    hasContext,
    hasReadySource,
    processing,
    processingSources,
    signature,
  };
}

export function isExpectedSourcesProcessingError(error) {
  return error?.response?.status === 409
    && /lesson sources are still processing/i.test(String(error.response?.data?.error || error.response?.data?.message || ''));
}

// Permit one automatic build for each persisted workflow state. Rerenders and
// StrictMode effect checks cannot start the same build again.
export function createLessonContextDraftGate() {
  let inFlight = false;
  let blockedSignature = '';

  return {
    observe(signature) {
      if (blockedSignature && signature && blockedSignature !== signature) blockedSignature = '';
    },
    start(signature, { force = false } = {}) {
      if (inFlight || (!force && blockedSignature === signature)) return false;
      inFlight = true;
      blockedSignature = signature;
      return true;
    },
    finish() {
      inFlight = false;
    },
    reset() {
      inFlight = false;
      blockedSignature = '';
    },
  };
}

