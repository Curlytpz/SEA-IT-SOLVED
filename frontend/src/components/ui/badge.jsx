import { mergeProps } from '@base-ui/react/merge-props';
import { useRender } from '@base-ui/react/use-render';
import { cva } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva('inline-flex min-h-6 w-fit shrink-0 items-center justify-center gap-1 rounded-md border px-2 py-0.5 text-xs font-medium whitespace-nowrap', {
  variants: { variant: {
    default: 'border-primary/20 bg-primary-subtle text-primary-subtle-foreground',
    secondary: 'border-border bg-secondary text-secondary-foreground',
    destructive: 'border-red-200 bg-red-50 text-red-700 dark:border-red-400/20 dark:bg-red-400/10 dark:text-red-200',
    outline: 'border-input bg-transparent text-foreground',
    success: 'border-success/20 bg-success-subtle text-success',
    warning: 'border-warning/25 bg-warning-subtle text-warning-foreground',
  }}, defaultVariants: { variant: 'secondary' },
});

function Badge({ className, variant = 'secondary', render, ...props }) {
  return useRender({ defaultTagName: 'span', props: mergeProps({ className: cn(badgeVariants({ variant }), className) }, props), render, state: { slot: 'badge', variant } });
}

export { Badge, badgeVariants };
