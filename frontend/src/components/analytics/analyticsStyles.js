export const analyticsHeadingClassName = [
  'flex min-w-0 items-start justify-between gap-4 max-[520px]:grid',
  '[&_h2]:text-base [&_h2]:font-[750] [&_h2]:tracking-[-.015em] [&_h2]:text-foreground',
  '[&_h3]:text-base [&_h3]:font-[750] [&_h3]:tracking-[-.015em] [&_h3]:text-foreground',
  '[&_p]:mt-[.2rem] [&_p]:text-xs [&_p]:leading-6 [&_p]:text-muted-foreground',
  '[&>span]:mt-[.2rem] [&>span]:text-xs [&>span]:leading-6 [&>span]:text-muted-foreground',
].join(' ');

export const analyticsMetricsClassName = [
  'mt-[.8rem] grid grid-cols-2 gap-3 min-[901px]:grid-cols-4',
  '[&>div]:rounded-[.8rem] [&>div]:p-4 [&>div]:shadow-none',
  '[&>div>div:first-child]:text-[1.15rem] min-[521px]:[&>div>div:first-child]:text-[1.45rem]',
].join(' ');
