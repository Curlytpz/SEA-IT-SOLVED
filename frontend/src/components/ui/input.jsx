import { Input as InputPrimitive } from '@base-ui/react/input';
import { cn } from '@/lib/utils';

function Input({ className, type, ...props }) {
  return <InputPrimitive type={type} data-slot="input" className={cn('min-h-11 w-full min-w-0 rounded-lg border border-input bg-input-surface px-3 py-2 text-base text-foreground shadow-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring/25 disabled:cursor-not-allowed disabled:border-disabled disabled:bg-disabled disabled:text-disabled-foreground sm:text-sm', className)} {...props}/>;
}

export { Input };
