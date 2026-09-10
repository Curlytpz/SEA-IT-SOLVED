import { cn } from '@/lib/utils';

function Label({ className, ...props }) {
  return <label data-slot="label" className={cn('block text-sm font-medium leading-5 text-slate-700 dark:text-slate-300', className)} {...props}/>;
}

export { Label };