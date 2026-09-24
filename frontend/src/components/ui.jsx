import { cloneElement, isValidElement, useEffect, useId, useRef, useState } from 'react';
import { Button as ShadButton } from './ui/button';
import { Card as ShadCard } from './ui/card';
import { StatusBadge as ShadStatusBadge } from './ui/badge';
import { Input as ShadInput } from './ui/input';
import { Label } from './ui/label';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from './ui/dialog';
import { ContentSkeleton, PageSkeleton, Skeleton } from './ui/skeleton';
import { AlertCircle, ArrowLeft, CheckCircle2, Info, TriangleAlert } from 'lucide-react';
import { Link } from 'react-router-dom';
import { cn } from '../lib/utils';

// Shared visual primitives for the light/dark dashboard design system.

export function Spinner({ size = 'sm', label = '' }) {
  const s = size === 'sm' ? 'h-4 w-4' : 'h-6 w-6';
  return <span role={label ? 'status' : undefined} aria-label={label || undefined} aria-hidden={label ? undefined : true} className={`${s} inline-block shrink-0 animate-spin rounded-full border-2 border-muted border-t-primary motion-reduce:animate-none motion-reduce:rounded-sm motion-reduce:border-0 motion-reduce:bg-current motion-reduce:opacity-70`} />;
}

export function LoadingIndicator({ text = 'Loading...', size = 'sm', className = '' }) {
  return <span role="status" aria-live="polite" className={`inline-flex items-center gap-2 ${className}`}><Spinner size={size}/><span>{text}</span></span>;
}

export function LoadingState({ text = 'Loading…' }) {
  return <div className="min-h-48 rounded-xl border border-border bg-surface p-5 shadow-surface"><span className="sr-only">{text}</span><ContentSkeleton lines={4}/></div>;
}

export function DashboardLoadingState({ cards = 3 }) { return <PageSkeleton cards={cards}/>; }

export { ContentSkeleton, PageSkeleton, Skeleton };

export function EmptyState({ icon, title, body, children }) {
  return (
    <div className="flex flex-col items-center justify-center px-4 py-12 text-center sm:py-16">
      <div className="mb-4 inline-grid h-12 w-12 place-items-center rounded-[.7rem] bg-primary-subtle text-2xl text-primary shadow-[inset_0_0_0_1px_hsl(var(--primary)/.14)] dark:text-primary-subtle-foreground">{icon}</div>
      <h3 className="mb-1 text-base font-semibold text-foreground">{title}</h3>
      {body && <p className="mb-4 max-w-md text-sm text-muted-foreground">{body}</p>}
      {children}
    </div>
  );
}

const STATUS_NOTICE_TYPES = {
  error: { tone: 'error', label: 'Error', role: 'alert', ariaLive: 'assertive' },
  destructive: { tone: 'error', label: 'Action required', role: 'alert', ariaLive: 'assertive' },
  success: { tone: 'success', label: 'Success', role: 'status', ariaLive: 'polite' },
  approved: { tone: 'success', label: 'Approved', role: 'status', ariaLive: 'polite' },
  warning: { tone: 'warning', label: 'Attention', role: 'status', ariaLive: 'polite' },
  stale: { tone: 'warning', label: 'Update required', role: 'status', ariaLive: 'polite' },
  pending: { tone: 'warning', label: 'Pending', role: 'status', ariaLive: 'polite' },
  info: { tone: 'info', label: 'Information', role: 'status', ariaLive: 'polite' },
};

const STATUS_NOTICE_TONES = {
  success: '[--status-notice-accent:var(--success)]',
  warning: '[--status-notice-accent:var(--warning)]',
  error: '[--status-notice-accent:var(--destructive)]',
  info: '[--status-notice-accent:var(--primary)]',
};

const STATUS_NOTICE_ICONS = {
  success: CheckCircle2,
  warning: TriangleAlert,
  error: AlertCircle,
  info: Info,
};

export function StatusNotice({ type = 'error', label, title, children, actions, onClose, className = '', role, ariaLive, animated = true }) {
  const [leaving, setLeaving] = useState(false);
  const closeTimer = useRef(null);
  const semantics = STATUS_NOTICE_TYPES[type] || STATUS_NOTICE_TYPES.info;
  const NoticeIcon = STATUS_NOTICE_ICONS[semantics.tone] || Info;
  useEffect(() => () => clearTimeout(closeTimer.current), []);

  function dismiss() {
    if (!onClose || leaving) return;
    setLeaving(true);
    closeTimer.current = setTimeout(onClose, 170);
  }

  return (
    <div
      role={role || semantics.role}
      aria-live={ariaLive || semantics.ariaLive}
      className={cn(
        'relative mb-4 flex min-w-0 items-start gap-3.5 overflow-hidden rounded-lg border border-border bg-[linear-gradient(90deg,hsl(var(--status-notice-accent)/.075),transparent_min(26rem,72%)),hsl(var(--surface))] py-3.5 pl-5 pr-4 text-foreground shadow-[0_8px_24px_-22px_hsl(var(--foreground)/.45)] before:absolute before:inset-y-0 before:left-0 before:w-[3px] before:bg-[hsl(var(--status-notice-accent))] max-sm:grid max-sm:grid-cols-[2rem_minmax(0,1fr)] max-sm:gap-3',
        STATUS_NOTICE_TONES[semantics.tone],
        animated && !leaving && 'animate-notice-in motion-reduce:animate-none',
        leaving && 'pointer-events-none animate-notice-out motion-reduce:animate-none',
        onClose && 'max-sm:[&>div:nth-child(2)]:pr-9',
        className,
      )}
    >
      <span aria-hidden="true" className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-[hsl(var(--status-notice-accent)/.1)] text-[hsl(var(--status-notice-accent))]"><NoticeIcon size={17}/></span>
      <div className="min-w-0 flex-1">
        <p className="text-[.625rem] font-extrabold uppercase leading-tight tracking-[.16em] text-[hsl(var(--status-notice-accent))]">{label || semantics.label}</p>
        {title
          ? <><p className="mt-1 text-sm font-semibold leading-[1.45] text-foreground">{title}</p>{children && <div className="mt-1 text-[.8125rem] font-normal leading-[1.55] text-muted-foreground">{children}</div>}</>
          : <div className="mt-1 text-sm font-semibold leading-[1.45] text-foreground">{children}</div>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 max-sm:col-span-2 max-sm:w-full max-sm:justify-start">{actions}</div>}
      {onClose && <button type="button" aria-label="Dismiss message" onClick={dismiss} className="grid h-11 w-11 shrink-0 place-items-center rounded-[.625rem] text-base font-bold text-muted-foreground transition-colors hover:bg-surface-subtle hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring max-sm:absolute max-sm:right-[.45rem] max-sm:top-[.45rem]">×</button>}
    </div>
  );
}

export function Alert(props) { return <StatusNotice {...props}/>; }

export function Badge({ status, ...props }) { return <ShadStatusBadge status={status} {...props}/>; }

export function Btn({ variant = 'primary', size = 'md', disabled, loading, loadingText = 'Working…', onClick, type = 'button', className = '', children, ...props }) {
  const variants = { primary: 'default', outline: 'outline', danger: 'destructive', success: 'success', ghost: 'ghost', warning: 'warning', secondary: 'secondary' };
  const sizes = { sm: 'sm', md: 'default', lg: 'lg' };
  return <ShadButton type={type} onClick={onClick} disabled={disabled || loading} aria-busy={loading || undefined} variant={variants[variant] || 'default'} size={sizes[size] || 'default'} className={`relative ${className}`} {...props}>{loading ? <><span aria-hidden="true" className="invisible inline-flex items-center gap-2">{children}</span><span className="absolute inset-0 inline-flex items-center justify-center"><Spinner/><span className="sr-only" aria-live="polite">{loadingText}</span></span></> : children}</ShadButton>;
}

export function Card({ children, className = '', interactive = false, ...props }) {
  return <ShadCard className={cn(interactive && 'transition-[border-color,box-shadow,transform,background-color] duration-200 hover:-translate-y-0.5 hover:border-primary/35 hover:shadow-glass active:translate-y-0 active:scale-[.995] motion-reduce:transform-none motion-reduce:transition-none', className)} {...props}>{children}</ShadCard>;
}

export function BackButton({ to, onClick, children = 'Back', replace = false, state, className = '', ...props }) {
  const styles = cn('group mb-4 inline-flex min-h-11 items-center gap-2 rounded-lg px-2.5 text-sm font-semibold text-muted-foreground transition-[color,background-color,transform] duration-150 hover:-translate-x-0.5 hover:bg-surface-subtle hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 active:translate-x-0 motion-reduce:transform-none motion-reduce:transition-none', className);
  const content = <><ArrowLeft size={17} aria-hidden="true" className="transition-transform duration-150 group-hover:-translate-x-0.5 motion-reduce:transform-none"/>{children}</>;
  if (to) return <Link to={to} replace={replace} state={state} className={styles} {...props}>{content}</Link>;
  return <button type="button" onClick={onClick} className={styles} {...props}>{content}</button>;
}

export function PageHeader({ title, subtitle, children }) {
  return (
    <div className="mb-6 flex min-w-0 flex-col items-start justify-between gap-3 max-[420px]:mb-[1.15rem] sm:flex-row">
      <div className="min-w-0"><h1 className="max-w-[34ch] [overflow-wrap:anywhere] text-[clamp(1.35rem,1.1rem+.85vw,1.8rem)] font-bold leading-[1.18] tracking-tight text-foreground">{title}</h1>{subtitle && <p className="mt-1 max-w-[72ch] text-sm leading-[1.55] text-muted-foreground">{subtitle}</p>}</div>
      {children && <div className="flex w-full min-w-0 flex-wrap items-center gap-2 [&>a]:inline-flex max-[420px]:[&>a>button]:w-full max-[420px]:[&>a]:flex-[1_1_100%] max-[420px]:[&>a]:w-full max-[420px]:[&>button]:flex-[1_1_100%] max-[420px]:[&>button]:w-full sm:w-auto sm:shrink-0">{children}</div>}
    </div>
  );
}

export function ConfirmModal({ title, body, confirmLabel, cancelLabel = 'Cancel', confirmVariant = 'danger', confirmDisabled = false, loading = false, loadingLabel = '', onConfirm, onCancel }) {
  return <Dialog open onOpenChange={open => { if (!open && !loading) onCancel(); }}>
    <DialogContent showCloseButton={false}>
      <DialogHeader><DialogTitle>{title}</DialogTitle><DialogDescription render={<div/>}>{body}</DialogDescription></DialogHeader>
      <DialogFooter><Btn variant="ghost" disabled={loading} onClick={onCancel}>{cancelLabel}</Btn><Btn variant={confirmVariant} loading={loading && !loadingLabel} disabled={confirmDisabled || (loading && Boolean(loadingLabel))} onClick={onConfirm}>{loading && loadingLabel ? <><Spinner/>{loadingLabel}</> : confirmLabel}</Btn></DialogFooter>
    </DialogContent>
  </Dialog>;
}

export function StatCard({ value, label, accent, className = '' }) {
  return <div className={cn('min-w-0 max-w-full rounded-xl border border-border bg-surface p-5 shadow-surface', accent && 'border-l-4', className)} style={accent ? {borderLeftColor:accent}: {}}><div className="text-3xl font-bold leading-none tracking-tight text-foreground">{value}</div><div className="mt-2 text-sm font-medium text-muted-foreground">{label}</div></div>;
}

export function SectionHeading({ title, description, action, className = '' }) {
  return <div className={cn('mb-3 flex min-w-0 items-end justify-between gap-4 max-md:items-stretch', className)}><div className="min-w-0"><h2 className="text-lg font-bold tracking-tight text-foreground">{title}</h2>{description && <p className="mt-1 max-w-[68ch] text-sm leading-6 text-muted-foreground">{description}</p>}</div>{action && <div className="shrink-0 self-center">{action}</div>}</div>;
}

export function TabBar({ tabs, active, onChange, label = 'View options' }) {
  return <div role="tablist" aria-label={label} className="scrollbar-hidden mb-5 flex gap-1 overflow-x-auto border-b border-border">{tabs.map(({key,label:tabLabel,badge}) => {
    const selected = active === key;
    const stateClass = selected
      ? 'border-primary bg-primary-subtle text-primary-subtle-foreground'
      : 'border-transparent text-muted-foreground hover:bg-surface-subtle hover:text-foreground';
    return <button key={key} type="button" role="tab" aria-selected={selected} onClick={()=>onChange(key)} className={'relative -mb-px min-h-11 touch-manipulation whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-semibold transition-colors duration-150 ' + stateClass}>{tabLabel}{badge>0&&<span className="ml-1.5 inline-flex min-w-5 items-center justify-center rounded-md bg-warning-subtle px-1.5 py-0.5 text-xs font-bold text-warning-subtle-foreground dark:bg-warning-subtle dark:text-warning-subtle-foreground">{badge}</span>}</button>;
  })}</div>;
}

export function Table({ columns, rows, emptyIcon, emptyTitle, emptyBody }) {
  if (!rows.length) return <EmptyState icon={emptyIcon} title={emptyTitle} body={emptyBody}/>;
  return <div className="scrollbar-hidden -mx-1 w-[calc(100%+.5rem)] max-w-full overflow-x-auto overscroll-x-contain rounded-xl border border-border bg-surface shadow-[0_1px_2px_rgba(15,23,42,.035)] [-webkit-overflow-scrolling:touch] sm:mx-0 sm:w-full"><table className="w-full min-w-[680px] text-sm"><thead><tr className="border-b border-border bg-surface-subtle">{columns.map(c=><th key={c.key} className="whitespace-nowrap px-4 py-3.5 text-left text-xs font-semibold text-muted-foreground">{c.label}</th>)}</tr></thead><tbody className="divide-y divide-border">{rows.map((row,i)=><tr key={row.id || row.enrollmentId || i} className="transition-colors hover:bg-surface-subtle">{columns.map(c=><td key={c.key} className="px-4 py-3.5 text-foreground">{c.render?c.render(row):row[c.key]}</td>)}</tr>)}</tbody></table></div>;
}

export function FormField({ label, children, hint, action }) {
  const generatedId = useId();
  const controlId = isValidElement(children) && children.props.id ? children.props.id : generatedId;
  const hintId = hint ? `${controlId}-hint` : undefined;
  const control = isValidElement(children) ? cloneElement(children, { id: controlId, 'aria-describedby': children.props['aria-describedby'] || hintId }) : children;
  return <div className="mb-4">{action?<div className="mb-1.5 flex min-w-0 items-center justify-between gap-3"><Label htmlFor={controlId}>{label}</Label>{action}</div>:<Label htmlFor={controlId} className="mb-1.5">{label}</Label>}{control}{hint&&<p id={hintId} className="mt-1.5 text-xs text-muted-foreground">{hint}</p>}</div>;
}

const fieldClass = `min-h-11 min-w-0 w-full rounded-lg border border-input bg-input-surface px-3 py-2.5 text-sm text-foreground shadow-sm placeholder:text-muted-foreground transition-colors focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/25 aria-[invalid=true]:border-destructive aria-[invalid=true]:ring-2 aria-[invalid=true]:ring-destructive/15 disabled:cursor-not-allowed disabled:border-disabled disabled:bg-disabled disabled:text-disabled-foreground`;
export function Input({ className = '', ...props }) { return <ShadInput {...props} className={className}/>; }
export function Select({ children, className = '', ...props }) { return <select {...props} className={`${fieldClass} ${className}`}>{children}</select>; }
export function Textarea({ className = '', ...props }) { return <textarea {...props} className={`${fieldClass} min-h-28 resize-y ${className}`}/>; }
