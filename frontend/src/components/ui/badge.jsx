import { mergeProps } from '@base-ui/react/merge-props';
import { useRender } from '@base-ui/react/use-render';
import { cva } from 'class-variance-authority';
import { cn } from '@/lib/utils';
import { getStatusPresentation } from '../../utils/statusPresentation.js';
import { StatusChip } from './tactile';

const badgeVariants = cva('inline-flex min-h-6 w-fit shrink-0 items-center justify-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold whitespace-nowrap shadow-[var(--neu-shadow-raised-sm)]', {
  variants: { variant: {
    default: 'border-primary/20 bg-primary-subtle text-primary-subtle-foreground',
    secondary: 'border-border bg-secondary text-secondary-foreground',
    destructive: 'border-destructive/25 bg-destructive-subtle text-destructive-subtle-foreground',
    outline: 'border-input bg-transparent text-foreground',
    success: 'border-success/20 bg-success-subtle text-success-subtle-foreground',
    warning: 'border-warning/25 bg-warning-subtle text-warning-subtle-foreground',
    processing: 'border-primary/25 bg-primary-subtle text-primary-subtle-foreground',
    info: 'border-info/25 bg-info-subtle text-info-subtle-foreground',
    draft: 'border-border bg-surface-subtle text-muted-foreground',
  }}, defaultVariants: { variant: 'secondary' },
});

function Badge({ className, variant = 'secondary', render, ...props }) {
  return useRender({ defaultTagName: 'span', props: mergeProps({ className: cn(badgeVariants({ variant }), className) }, props), render, state: { slot: 'badge', variant } });
}

function StatusBadge({ status, label, className, pulse, ...props }) {
  const presentation = getStatusPresentation(status, label);
  return <StatusChip status={presentation.status} label={presentation.label} className={className} pulse={pulse} data-status={presentation.status || undefined} {...props}/>;
}

export { Badge, StatusBadge, badgeVariants };
