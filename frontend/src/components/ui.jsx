import { cloneElement, isValidElement, useEffect, useId, useRef, useState } from 'react';
import { Button as ShadButton } from './ui/button';
import { Card as ShadCard } from './ui/card';
import { Badge as ShadBadge } from './ui/badge';
import { Input as ShadInput } from './ui/input';
import { Label } from './ui/label';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from './ui/dialog';

// Shared visual primitives for the light/dark dashboard design system.

export function Spinner({ size = 'sm', label = '' }) {
  const s = size === 'sm' ? 'h-4 w-4' : 'h-6 w-6';
  return <span role={label ? 'status' : undefined} aria-label={label || undefined} aria-hidden={label ? undefined : true} className={`${s} loading-spinner inline-block shrink-0 rounded-full border-2 border-muted border-t-primary`} />;
}

export function LoadingIndicator({ text = 'Loading...', size = 'sm', className = '' }) {
  return <span role="status" aria-live="polite" className={`inline-flex items-center gap-2 ${className}`}><Spinner size={size}/><span>{text}</span></span>;
}

export function LoadingState({ text = 'Loading…' }) {
  return <div className="flex min-h-48 items-center justify-center text-sm text-muted-foreground"><LoadingIndicator text={text} size="md" className="flex-col gap-3"/></div>;
}

export function EmptyState({ icon, title, body, children }) {
  return (
    <div className="flex flex-col items-center justify-center px-4 py-12 text-center sm:py-16">
      <div className="icon-tile mb-4 h-12 w-12 text-2xl">{icon}</div>
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

export function StatusNotice({ type = 'error', label, title, children, actions, onClose, className = '', role, ariaLive, animated = true }) {
  const [leaving, setLeaving] = useState(false);
  const closeTimer = useRef(null);
  const semantics = STATUS_NOTICE_TYPES[type] || STATUS_NOTICE_TYPES.info;
  useEffect(() => () => clearTimeout(closeTimer.current), []);

  function dismiss() {
    if (!onClose || leaving) return;
    setLeaving(true);
    closeTimer.current = setTimeout(onClose, 170);
  }

  return (
    <div role={role || semantics.role} aria-live={ariaLive || semantics.ariaLive} className={`status-notice status-notice--${semantics.tone} ${animated ? 'alert-motion' : ''} mb-4 ${leaving ? 'is-leaving' : ''} ${className}`}>
      <div className="min-w-0 flex-1">
        <p className="status-notice-label">{label || semantics.label}</p>
        {title
          ? <><p className="status-notice-title">{title}</p>{children && <div className="status-notice-copy">{children}</div>}</>
          : <div className="status-notice-title">{children}</div>}
      </div>
      {actions && <div className="status-notice-actions">{actions}</div>}
      {onClose && <button type="button" aria-label="Dismiss message" onClick={dismiss} className="status-notice-dismiss">×</button>}
    </div>
  );
}

export function Alert(props) { return <StatusNotice {...props}/>; }

export function Badge({ status }) {
  const variants = {
    ACTIVE: 'success', APPROVED: 'success', GRADED: 'success', PUBLISHED: 'success',
    PENDING: 'warning', PAUSED: 'warning', PROCESSING: 'warning',
    REJECTED: 'destructive', SUSPENDED: 'destructive', FAILED: 'destructive',
  };
  return <ShadBadge variant={variants[status] || 'secondary'}>{String(status || '').replaceAll('_', ' ')}</ShadBadge>;
}

export function Btn({ variant = 'primary', size = 'md', disabled, loading, loadingText = 'Working…', onClick, type = 'button', className = '', children, ...props }) {
  const variants = { primary: 'default', outline: 'outline', danger: 'destructive', success: 'success', ghost: 'ghost', warning: 'warning', secondary: 'secondary' };
  const sizes = { sm: 'sm', md: 'default', lg: 'lg' };
  return <ShadButton type={type} onClick={onClick} disabled={disabled || loading} aria-busy={loading || undefined} variant={variants[variant] || 'default'} size={sizes[size] || 'default'} className={`relative ${className}`} {...props}>{loading ? <><span aria-hidden="true" className="invisible inline-flex items-center gap-2">{children}</span><span className="absolute inset-0 inline-flex items-center justify-center"><Spinner/><span className="sr-only" aria-live="polite">{loadingText}</span></span></> : children}</ShadButton>;
}

export function Card({ children, className = '', ...props }) { return <ShadCard className={className} {...props}>{children}</ShadCard>; }

export function PageHeader({ title, subtitle, children }) {
  return (
    <div className="page-header mb-6 flex min-w-0 flex-col items-start justify-between gap-3 sm:flex-row">
      <div className="min-w-0"><h1 className="text-2xl font-bold tracking-tight text-foreground">{title}</h1>{subtitle && <p className="mt-1 max-w-3xl text-sm text-muted-foreground">{subtitle}</p>}</div>
      {children && <div className="page-header-actions flex w-full min-w-0 flex-wrap items-center gap-2 sm:w-auto sm:shrink-0">{children}</div>}
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
  return <div className={`glass-panel rounded-2xl border p-5 ${accent ? 'border-l-4' : ''} ${className}`} style={accent ? {borderLeftColor:accent}: {}}><div className="text-3xl font-bold leading-none tracking-tight text-foreground">{value}</div><div className="mt-2 text-sm font-medium text-muted-foreground">{label}</div></div>;
}

export function TabBar({ tabs, active, onChange, label = 'View options' }) {
  return <div role="tablist" aria-label={label} className="scrollbar-hidden mb-5 flex gap-1 overflow-x-auto border-b border-border">{tabs.map(({key,label:tabLabel,badge}) => {
    const selected = active === key;
    const stateClass = selected
      ? 'border-primary bg-primary-subtle text-primary-subtle-foreground'
      : 'border-transparent text-muted-foreground hover:bg-surface-subtle hover:text-foreground';
    return <button key={key} type="button" role="tab" aria-selected={selected} onClick={()=>onChange(key)} className={'relative -mb-px min-h-11 touch-manipulation whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-semibold transition-colors duration-150 ' + stateClass}>{tabLabel}{badge>0&&<span className="ml-1.5 inline-flex min-w-5 items-center justify-center rounded-md bg-amber-100 px-1.5 py-0.5 text-xs font-bold text-amber-800 dark:bg-amber-500/15 dark:text-amber-200">{badge}</span>}</button>;
  })}</div>;
}

export function Table({ columns, rows, emptyIcon, emptyTitle, emptyBody }) {
  if (!rows.length) return <EmptyState icon={emptyIcon} title={emptyTitle} body={emptyBody}/>;
  return <div className="table-shell"><table className="w-full min-w-[680px] text-sm"><thead><tr className="border-b border-border bg-surface-subtle">{columns.map(c=><th key={c.key} className="whitespace-nowrap px-4 py-3.5 text-left text-xs font-semibold text-muted-foreground">{c.label}</th>)}</tr></thead><tbody className="divide-y divide-border">{rows.map((row,i)=><tr key={row.id || row.enrollmentId || i} className="transition-colors hover:bg-surface-subtle">{columns.map(c=><td key={c.key} className="px-4 py-3.5 text-foreground">{c.render?c.render(row):row[c.key]}</td>)}</tr>)}</tbody></table></div>;
}

export function FormField({ label, children, hint, action }) {
  const generatedId = useId();
  const controlId = isValidElement(children) && children.props.id ? children.props.id : generatedId;
  const hintId = hint ? `${controlId}-hint` : undefined;
  const control = isValidElement(children) ? cloneElement(children, { id: controlId, 'aria-describedby': children.props['aria-describedby'] || hintId }) : children;
  return <div className="mb-4">{action?<div className="mb-1.5 flex min-w-0 items-center justify-between gap-3"><Label htmlFor={controlId}>{label}</Label>{action}</div>:<Label htmlFor={controlId} className="mb-1.5">{label}</Label>}{control}{hint&&<p id={hintId} className="mt-1.5 text-xs text-muted-foreground">{hint}</p>}</div>;
}

const fieldClass = `min-h-11 min-w-0 w-full rounded-lg border border-input bg-input-surface px-3 py-2.5 text-sm text-foreground shadow-sm placeholder:text-muted-foreground transition-colors focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/25 disabled:border-disabled disabled:bg-disabled disabled:text-disabled-foreground`;
export function Input({ className = '', ...props }) { return <ShadInput {...props} className={className}/>; }
export function Select({ children, className = '', ...props }) { return <select {...props} className={`${fieldClass} ${className}`}>{children}</select>; }
export function Textarea({ className = '', ...props }) { return <textarea {...props} className={`${fieldClass} min-h-28 resize-y ${className}`}/>; }
