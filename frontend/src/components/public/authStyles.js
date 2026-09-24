export const authFormClassName = [
  'mt-6 grid gap-4',
  '[&>.mb-4]:mb-0 [&_label]:text-sm [&_label]:text-foreground',
  '[&_input]:min-h-12 [&_input]:border-input [&_input]:bg-input-surface [&_input]:text-base [&_input]:text-foreground',
  '[&_input:hover:not(:disabled)]:border-muted-foreground',
  '[&_button[type=submit]]:min-h-12 [&_button[type=submit]]:rounded-[.7rem] [&_button[type=submit]]:shadow-none',
].join(' ');

export const authNameGridClassName = 'grid grid-cols-1 gap-3 min-[480px]:grid-cols-2 [&>.mb-4]:mb-0';

export const authSuccessClassName = 'mt-6 grid gap-4 rounded-xl border border-success/25 bg-success-subtle p-5 text-center text-success [&_svg]:mx-auto [&_p]:text-sm [&_p]:leading-[1.6]';

export const authSignInClassName = 'mt-5 text-center text-sm text-muted-foreground [&_a]:font-bold [&_a]:text-primary [&_a]:outline-offset-[3px] [&_a]:hover:text-primary-hover [&_a]:hover:underline [&_a]:focus-visible:outline [&_a]:focus-visible:outline-2 [&_a]:focus-visible:outline-primary';

export const authChoiceDividerClassName = "my-6 flex items-center gap-3 text-center text-xs text-muted-foreground before:h-px before:flex-1 before:bg-border before:content-[''] after:h-px after:flex-1 after:bg-border after:content-['']";

export const authRegistrationActionsClassName = 'grid gap-2';

export const authSecondaryActionClassName = 'flex min-h-11 items-center justify-center rounded-lg border border-input px-4 py-2.5 text-sm font-bold text-foreground transition-[border-color,background-color,color,transform] duration-150 active:scale-[.99] hover:border-primary/35 hover:bg-primary-subtle hover:text-primary-subtle-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[3px] focus-visible:outline-primary';
