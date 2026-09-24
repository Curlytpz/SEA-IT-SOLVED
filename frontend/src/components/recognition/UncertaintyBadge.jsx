export default function UncertaintyBadge({ reason }) {
  return (
    <span className="inline-flex rounded-lg border border-warning/25 bg-warning-subtle px-2 py-1 text-xs font-medium text-warning-subtle-foreground">
      Uncertain{reason ? `: ${reason}` : ''}
    </span>
  );
}
