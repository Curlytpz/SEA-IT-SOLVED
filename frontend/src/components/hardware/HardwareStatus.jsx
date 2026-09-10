import { Badge } from '../ui';

export default function HardwareStatus({ label, status, simulated = true, detail }) {
  const tone = ['READY','ON','RECORDING','SAVED'].includes(status) ? 'text-emerald-600 dark:text-emerald-300'
    : ['PAUSED','UNSAVED'].includes(status) ? 'text-amber-600 dark:text-amber-300'
      : status === 'ERROR' ? 'text-red-600 dark:text-red-300' : 'text-slate-500 dark:text-slate-400';
  return (
    <div className="flex min-h-16 items-center justify-between gap-3 rounded-xl border border-slate-200/80 bg-white/50 px-3.5 py-3 dark:border-white/10 dark:bg-white/[.035]">
      <div><p className="text-xs font-semibold text-slate-700 dark:text-slate-200">{label}</p>{detail&&<p className="mt-0.5 text-[11px] text-slate-400">{detail}</p>}</div>
      <div className="flex items-center gap-2"><span className={`text-[11px] font-bold ${tone}`}>{status}</span>{simulated&&<Badge status="SIMULATED"/>}</div>
    </div>
  );
}
