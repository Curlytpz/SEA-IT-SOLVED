export default function UncertaintyBadge({ reason }) {
  return (
    <span className="inline-flex rounded-lg bg-amber-50 px-2 py-1 text-xs font-medium text-amber-800 ring-1 ring-inset ring-amber-200 dark:bg-amber-400/10 dark:text-amber-200 dark:ring-amber-400/20">
      Uncertain{reason ? `: ${reason}` : ''}
    </span>
  );
}
