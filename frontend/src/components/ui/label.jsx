import { cn } from '@/lib/utils';

function Label({ className, ...props }) {
  return <label data-slot="label" className={cn('block text-sm font-medium leading-5 text-foreground', className)} {...props}/>;
}

export { Label };
