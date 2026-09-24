const STATUS_TONES = {
  INFO: 'info',
  PROCESSING: 'processing',
  IN_PROGRESS: 'processing',
  RETRYING: 'processing',
  ACTIVE: 'processing',
  LIVE: 'processing',

  SUCCESS: 'success',
  SUCCEEDED: 'success',
  COMPLETE: 'success',
  COMPLETED: 'success',
  APPROVED: 'success',
  PUBLISHED: 'success',
  GRADED: 'success',
  AVAILABLE: 'success',
  READY: 'success',
  CONFIGURED: 'success',

  WARNING: 'warning',
  WAITING: 'warning',
  PENDING: 'warning',
  PAUSED: 'warning',
  NEEDS_ATTENTION: 'warning',
  NEEDS_RETRY: 'warning',
  REVIEW_REQUIRED: 'warning',
  READY_FOR_REVIEW: 'warning',
  SUBMITTED: 'warning',
  SUBMITTED_AWAITING_REVIEW: 'warning',

  ERROR: 'error',
  FAILED: 'error',
  REJECTED: 'error',
  SUSPENDED: 'error',

  DISABLED: 'neutral',
  DRAFT: 'draft',
  NOT_STARTED: 'neutral',
  CLOSED: 'neutral',
};

const STATUS_LABELS = {
  IN_PROGRESS: 'In progress',
  NEEDS_ATTENTION: 'Needs attention',
  NEEDS_RETRY: 'Needs retry',
  REVIEW_REQUIRED: 'Ready for review',
  READY_FOR_REVIEW: 'Ready for review',
  SUBMITTED_AWAITING_REVIEW: 'Awaiting review',
  NOT_STARTED: 'Not started',
};

const TONE_VARIANTS = {
  processing: 'processing',
  success: 'success',
  warning: 'warning',
  error: 'destructive',
  info: 'info',
  draft: 'draft',
  neutral: 'secondary',
};

export function normalizeStatus(value) {
  return String(value || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function humanizeStatus(status) {
  if (!status) return '';
  return status
    .toLowerCase()
    .split('_')
    .filter(Boolean)
    .map((word, index) => index === 0 ? `${word.charAt(0).toUpperCase()}${word.slice(1)}` : word)
    .join(' ');
}

export function getStatusPresentation(value, label) {
  const status = normalizeStatus(value);
  const tone = STATUS_TONES[status] || 'neutral';
  return {
    status,
    tone,
    variant: TONE_VARIANTS[tone],
    label: label || STATUS_LABELS[status] || humanizeStatus(status),
    animated: tone === 'processing',
  };
}

