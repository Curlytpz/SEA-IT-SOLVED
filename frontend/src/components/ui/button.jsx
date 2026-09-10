import { Button as ButtonPrimitive } from '@base-ui/react/button';
import { cva } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'inline-flex min-h-11 shrink-0 touch-manipulation items-center justify-center gap-2 whitespace-nowrap rounded-lg border text-sm font-semibold shadow-sm transition-[background-color,border-color,color,box-shadow,transform] duration-150 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background active:scale-[.98] disabled:pointer-events-none disabled:border-disabled disabled:bg-disabled disabled:text-disabled-foreground disabled:shadow-none [&_svg]:pointer-events-none [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        default: 'border-primary bg-primary text-primary-foreground hover:border-primary-hover hover:bg-primary-hover hover:shadow-md',
        outline: 'border-input bg-card text-card-foreground hover:border-primary/35 hover:bg-primary-subtle hover:text-primary-subtle-foreground',
        secondary: 'border-border bg-secondary text-secondary-foreground hover:bg-surface-elevated',
        ghost: 'border-transparent bg-transparent text-muted-foreground shadow-none hover:bg-surface-elevated hover:text-foreground',
        destructive: 'border-red-600 bg-red-600 text-white hover:border-red-500 hover:bg-red-500',
        success: 'border-success bg-success text-success-foreground hover:brightness-95',
        warning: 'border-warning bg-warning text-warning-foreground hover:brightness-95',
        link: 'min-h-0 border-transparent bg-transparent p-0 text-primary shadow-none underline-offset-4 hover:text-primary-hover hover:underline active:scale-100',
      },
      size: {
        default: 'px-4 py-2',
        sm: 'min-h-11 px-3 py-2 text-xs',
        lg: 'min-h-12 px-5 py-2.5 text-base',
        icon: 'h-11 w-11 p-0',
        'icon-sm': 'h-11 w-11 p-0',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  }
);

function Button({ className, variant = 'default', size = 'default', ...props }) {
  return <ButtonPrimitive data-slot="button" className={cn(buttonVariants({ variant, size }), className)} {...props}/>;
}

export { Button, buttonVariants };
