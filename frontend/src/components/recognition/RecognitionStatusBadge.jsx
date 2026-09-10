const styles = {
  NOT_STARTED: 'bg-slate-100 text-slate-600 ring-slate-200 dark:bg-white/[.07] dark:text-slate-300 dark:ring-white/10',
  PENDING: 'bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-400/10 dark:text-amber-300 dark:ring-amber-400/20',
  PROCESSING: 'bg-info-subtle text-info ring-info/20',
  REVIEW_REQUIRED: 'bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-400/10 dark:text-emerald-300 dark:ring-emerald-400/20',
  FAILED: 'bg-red-50 text-red-700 ring-red-200 dark:bg-red-400/10 dark:text-red-300 dark:ring-red-400/20',
};

const labels = {
  NOT_STARTED: 'Not processed',
  PENDING: 'Waiting',
  PROCESSING: 'Processing',
  REVIEW_REQUIRED: 'Ready for review',
  FAILED: 'Needs retry',
};

export default function RecognitionStatusBadge({ status = 'NOT_STARTED' }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold ring-1 ring-inset ${styles[status] || styles.NOT_STARTED}`}>
      {status === 'PROCESSING' && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-current" aria-hidden="true" />}
      {labels[status] || status}
    </span>
  );
}
