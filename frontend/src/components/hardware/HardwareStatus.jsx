import { Badge } from '../ui';

export default function HardwareStatus({ label, status, simulated = true, detail }) {
  const tone = ['READY','ON','RECORDING','SAVED'].includes(status) ? 'text-success-subtle-foreground'
    : ['PAUSED','UNSAVED'].includes(status) ? 'text-warning-subtle-foreground'
      : status === 'ERROR' ? 'text-destructive-subtle-foreground' : 'text-muted-foreground';
  return (
    <div className="flex min-h-16 items-center justify-between gap-3 rounded-xl border border-border/80 bg-card/50 px-3.5 py-3 dark:border-border dark:bg-card/[.035]">
      <div><p className="text-xs font-semibold text-foreground dark:text-foreground">{label}</p>{detail&&<p className="mt-0.5 text-[11px] text-muted-foreground">{detail}</p>}</div>
      <div className="flex items-center gap-2"><span className={`text-[11px] font-bold ${tone}`}>{status}</span>{simulated&&<Badge status="SIMULATED"/>}</div>
    </div>
  );
}
