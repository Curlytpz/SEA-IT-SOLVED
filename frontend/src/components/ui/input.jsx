import { Input as InputPrimitive } from '@base-ui/react/input';
import { cn } from '@/lib/utils';

function Input({ className, type, ...props }) {
  return <InputPrimitive type={type} data-slot="input" className={cn('min-h-11 w-full min-w-0 rounded-2xl border border-white/60 bg-input-surface px-3.5 py-2 text-base text-foreground shadow-[var(--neu-shadow-inset)] outline-none transition-[border-color,box-shadow,background-color] duration-200 placeholder:text-muted-foreground focus-visible:border-primary/60 focus-visible:ring-2 focus-visible:ring-ring/30 aria-[invalid=true]:border-destructive aria-[invalid=true]:ring-2 aria-[invalid=true]:ring-destructive/15 disabled:cursor-not-allowed disabled:border-disabled disabled:bg-disabled disabled:text-disabled-foreground sm:text-sm dark:border-border/80', className)} {...props}/>;
}

export { Input };
