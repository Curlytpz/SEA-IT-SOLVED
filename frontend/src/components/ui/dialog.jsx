import * as React from 'react';
import { Dialog as DialogPrimitive } from '@base-ui/react/dialog';
import { XIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

const Dialog = props => <DialogPrimitive.Root data-slot="dialog" {...props}/>;
const DialogTrigger = props => <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props}/>;
const DialogPortal = props => <DialogPrimitive.Portal data-slot="dialog-portal" {...props}/>;
const DialogClose = props => <DialogPrimitive.Close data-slot="dialog-close" {...props}/>;

function DialogOverlay({ className, ...props }) {
  return <DialogPrimitive.Backdrop data-slot="dialog-overlay" className={cn('fixed inset-0 z-50 bg-sidebar/65 opacity-100 transition-opacity duration-200 data-[ending-style]:opacity-0 data-[starting-style]:opacity-0 motion-reduce:transition-none', className)} {...props}/>;
}

function DialogContent({ className, children, showCloseButton = true, ...props }) {
  return <DialogPortal>
    <DialogOverlay/>
    <DialogPrimitive.Popup data-slot="dialog-content" className={cn('fixed left-1/2 top-1/2 z-50 grid max-h-[calc(100dvh-2rem)] w-full max-w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 scale-100 gap-4 overflow-y-auto rounded-xl border border-border bg-popover p-5 text-sm text-popover-foreground opacity-100 shadow-2xl outline-none transition-[opacity,transform] duration-200 data-[ending-style]:scale-[.97] data-[ending-style]:opacity-0 data-[starting-style]:scale-[.97] data-[starting-style]:opacity-0 motion-reduce:transition-none sm:max-w-md sm:p-6', className)} {...props}>
      {children}
      {showCloseButton && <DialogPrimitive.Close render={<Button variant="ghost" size="icon-sm" className="absolute right-2 top-2"/>}><XIcon/><span className="sr-only">Close</span></DialogPrimitive.Close>}
    </DialogPrimitive.Popup>
  </DialogPortal>;
}

const DialogHeader = ({ className, ...props }) => <div data-slot="dialog-header" className={cn('flex flex-col gap-1.5', className)} {...props}/>;
const DialogFooter = ({ className, ...props }) => <div data-slot="dialog-footer" className={cn('mt-2 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end', className)} {...props}/>;
const DialogTitle = ({ className, ...props }) => <DialogPrimitive.Title data-slot="dialog-title" className={cn('text-lg font-semibold leading-tight text-foreground', className)} {...props}/>;
const DialogDescription = ({ className, ...props }) => <DialogPrimitive.Description data-slot="dialog-description" className={cn('text-sm leading-relaxed text-muted-foreground', className)} {...props}/>;

export { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogOverlay, DialogPortal, DialogTitle, DialogTrigger };
