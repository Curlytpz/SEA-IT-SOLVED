import { normalizeRecognitionStatus } from './recognitionStatus';
import { StatusBadge } from '../ui/badge';
import { normalizeStatus } from '../../utils/statusPresentation.js';

const labels = {
  NOT_STARTED: 'Not processed',
  PENDING: 'Waiting',
  PROCESSING: 'Processing',
  RETRYING: 'Retrying…',
  NEEDS_ATTENTION: 'Needs attention',
  NEEDS_RETRY: 'Needs retry',
  REVIEW_REQUIRED: 'Ready for review',
  FAILED: 'Failed',
};

export default function RecognitionStatusBadge({ status = 'NOT_STARTED' }) {
  const normalizedStatus = normalizeRecognitionStatus(status);
  const requestedStatus = normalizeStatus(status);
  const displayStatus = ['NEEDS_ATTENTION', 'NEEDS_RETRY'].includes(requestedStatus) ? requestedStatus : normalizedStatus;
  return <StatusBadge status={displayStatus} label={labels[displayStatus]} className="px-2.5 py-1 text-[11px]"/>;
}
