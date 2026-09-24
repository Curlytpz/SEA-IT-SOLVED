import { StatusBadge } from '../ui/badge';
const labels = { NOT_STARTED: 'Not processed', PENDING: 'Waiting', PROCESSING: 'Processing', REVIEW_REQUIRED: 'Ready for review', FAILED: 'Failed' };

export default function TranscriptStatusBadge({ status = 'NOT_STARTED' }) {
  return <StatusBadge status={status} label={labels[status]} className="px-2.5 py-1 text-[11px]"/>;
}
