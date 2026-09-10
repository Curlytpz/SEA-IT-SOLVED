import * as React from 'react';
import { cn } from '@/lib/utils';

const Card = ({ className, ...props }) => <div data-slot="card" className={cn('flex min-w-0 flex-col overflow-hidden rounded-xl border border-border bg-card text-sm text-card-foreground shadow-[0_1px_2px_rgba(15,23,42,.04),0_8px_24px_-22px_rgba(15,23,42,.24)]', className)} {...props}/>;
const CardHeader = ({ className, ...props }) => <div data-slot="card-header" className={cn('grid gap-1 px-5 pt-5', className)} {...props}/>;
const CardTitle = ({ className, ...props }) => <div data-slot="card-title" className={cn('text-base font-semibold leading-snug', className)} {...props}/>;
const CardDescription = ({ className, ...props }) => <div data-slot="card-description" className={cn('text-sm text-muted-foreground', className)} {...props}/>;
const CardAction = ({ className, ...props }) => <div data-slot="card-action" className={cn('justify-self-end', className)} {...props}/>;
const CardContent = ({ className, ...props }) => <div data-slot="card-content" className={cn('px-5', className)} {...props}/>;
const CardFooter = ({ className, ...props }) => <div data-slot="card-footer" className={cn('flex items-center border-t border-border bg-surface-subtle px-5 py-4', className)} {...props}/>;

export { Card, CardHeader, CardFooter, CardTitle, CardAction, CardDescription, CardContent };
