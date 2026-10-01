import { CheckCircle2, CircleAlert, CircleX, Info, LoaderCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getStatusPresentation } from '../../utils/statusPresentation.js';

const STATUS_ICONS = {
  success: CheckCircle2,
  warning: CircleAlert,
  error: CircleX,
  info: Info,
  processing: LoaderCircle,
  neutral: Info,
  draft: Info,
};

export function StatusChip({ status, label, className = '', pulse, ...props }) {
  const presentation = getStatusPresentation(status, label);
  const Icon = STATUS_ICONS[presentation.tone] || Info;
  const animated = pulse ?? presentation.animated;
  return <span className={cn('inline-flex min-h-7 items-center gap-1.5 rounded-full border border-white/60 bg-surface-elevated px-2.5 py-1 text-[12px] font-semibold shadow-[var(--neu-shadow-raised-sm)] dark:border-border/80', {
    'text-success-subtle-foreground bg-success-subtle': presentation.tone === 'success',
    'text-warning-subtle-foreground bg-warning-subtle': presentation.tone === 'warning',
    'text-destructive-subtle-foreground bg-destructive-subtle': presentation.tone === 'error',
    'text-info-subtle-foreground bg-info-subtle': presentation.tone === 'info' || presentation.tone === 'processing',
    'text-muted-foreground bg-secondary': presentation.tone === 'neutral' || presentation.tone === 'draft',
  }, className)} {...props}>
    <Icon size={14} aria-hidden="true" className={animated ? 'animate-spin motion-reduce:animate-none' : ''}/>{presentation.label}
  </span>;
}

export function Toggle({ checked, onCheckedChange, disabled = false, label, className = '', ...props }) {
  return <button type="button" role="switch" aria-checked={checked} aria-label={label} disabled={disabled} onClick={() => onCheckedChange?.(!checked)} className={cn('relative inline-flex min-h-10 min-w-16 items-center rounded-full border border-white/60 bg-[var(--surface-2)] p-1 shadow-[var(--sh-inset)] transition-[background-color,box-shadow] duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50 dark:border-border/80', checked && 'bg-primary/20', className)} {...props}>
    <span className={cn('h-8 w-8 rounded-full bg-surface-elevated shadow-[var(--neu-shadow-raised-sm)] transition-transform duration-200 ease-[var(--ease-apple)]', checked && 'translate-x-6 bg-primary')} aria-hidden="true"/>
    <span className="sr-only">{checked ? 'On' : 'Off'}</span>
  </button>;
}

export function Meter({ value = 0, label, className = '' }) {
  const clamped = Math.max(0, Math.min(100, Number(value) || 0));
  return <div role="meter" aria-label={label} aria-valuemin="0" aria-valuemax="100" aria-valuenow={Math.round(clamped)} className={cn('h-3 overflow-hidden rounded-full bg-[var(--surface-2)] shadow-[var(--sh-inset)]', className)}>
    <div className="h-full rounded-full bg-primary transition-[width] duration-150" style={{ width: `${clamped}%` }}/>
  </div>;
}

export function CircularGauge({ value = 0, label, detail, center, ariaLabel, strokeWidth = 7, bare = false, className = '' }) {
  const clamped = Math.max(0, Math.min(100, Number(value) || 0));
  const radius = 52;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (clamped / 100) * circumference;
  return <div className={cn('relative grid h-28 w-28 shrink-0 place-items-center', !bare && 'rounded-full bg-[var(--surface-2)] shadow-[var(--sh-inset)]', className)} role="img" aria-label={ariaLabel || ((label || 'Value') + ': ' + Math.round(clamped) + '%')}>
    <svg viewBox="0 0 140 140" className="h-full w-full -rotate-90" aria-hidden="true">
      <defs><linearGradient id="circular-gauge-teal" x1="18%" y1="12%" x2="82%" y2="88%"><stop stopColor="#2dd4bf" /><stop offset="1" stopColor="#14b8a6" /></linearGradient></defs>
      <circle cx="70" cy="70" r={radius} fill="none" stroke="var(--lo)" strokeOpacity=".5" strokeWidth={strokeWidth} />
      <circle cx="70" cy="70" r={radius} fill="none" stroke="url(#circular-gauge-teal)" strokeLinecap="round" strokeWidth={strokeWidth} strokeDasharray={circumference} strokeDashoffset={offset} className="transition-[stroke-dashoffset] duration-[900ms] ease-[cubic-bezier(.32,.72,0,1)] motion-reduce:transition-none" />
    </svg>
    <div className="absolute grid text-center">{center || <><strong className="text-lg leading-none tabular-nums text-foreground">{Math.round(clamped)}%</strong>{detail && <span className="mt-1 text-[12px] leading-none text-muted-foreground">{detail}</span>}</>}</div>
  </div>;
}

export function Tooltip({ children, label, className = '' }) {
  return <span className={cn('inline-flex', className)} title={label}>{children}</span>;
}
