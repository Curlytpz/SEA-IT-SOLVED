const STATUS_ALIASES = {
  QUEUED: 'PENDING',
  SUCCESS: 'REVIEW_REQUIRED',
  SUCCEEDED: 'REVIEW_REQUIRED',
  COMPLETE: 'REVIEW_REQUIRED',
  COMPLETED: 'REVIEW_REQUIRED',
  ERROR: 'FAILED',
  NEEDS_ATTENTION: 'FAILED',
  NEEDS_RETRY: 'FAILED',
};

const RETRYABLE_STATUSES = new Set(['FAILED']);
const RUNNING_STATUSES = new Set(['PENDING', 'PROCESSING', 'RETRYING']);

export function normalizeRecognitionStatus(value) {
  const status = String(value || 'NOT_STARTED').trim().toUpperCase().replaceAll('-', '_').replaceAll(' ', '_');
  return STATUS_ALIASES[status] || status;
}

export function captureRecognitionStatus(item, lessonRecognition) {
  return normalizeRecognitionStatus(item?.recognition?.status || lessonRecognition?.status || 'NOT_STARTED');
}

export function isRecognitionRetryable(value) {
  return RETRYABLE_STATUSES.has(normalizeRecognitionStatus(value));
}

export function isRecognitionRunning(value) {
  return RUNNING_STATUSES.has(normalizeRecognitionStatus(value));
}
