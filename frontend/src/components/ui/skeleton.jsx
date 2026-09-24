import { cn } from "@/lib/utils"

function Skeleton({
  className,
  ...props
}) {
  return (
    <div
      data-slot="skeleton"
      aria-hidden="true"
      className={cn("animate-pulse rounded-md bg-skeleton motion-reduce:animate-none", className)}
      {...props} />
  );
}

function PageSkeleton({ cards = 3, className }) {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-label="Loading page content"
      className={cn("w-full space-y-6", className)}
    >
      <span className="sr-only">Loading page content…</span>
      <div aria-hidden="true" className="space-y-2">
        <Skeleton className="h-7 w-[min(18rem,68%)]" />
        <Skeleton className="h-4 w-[min(30rem,92%)]" />
      </div>
      <div aria-hidden="true" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: cards }, (_, index) => (
          <div key={index} className="rounded-xl border border-border bg-surface p-5 shadow-surface">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="mt-4 h-8 w-16" />
            <Skeleton className="mt-3 h-3 w-32 max-w-full" />
          </div>
        ))}
      </div>
      <div aria-hidden="true" className="rounded-xl border border-border bg-surface p-5 shadow-surface">
        <Skeleton className="h-5 w-44" />
        <div className="mt-5 space-y-3">
          <Skeleton className="h-11 w-full" />
          <Skeleton className="h-11 w-full" />
          <Skeleton className="h-11 w-4/5" />
        </div>
      </div>
    </div>
  );
}

function ContentSkeleton({ lines = 3, className }) {
  return (
    <div role="status" aria-live="polite" aria-label="Loading content" className={cn("w-full space-y-3", className)}>
      <span className="sr-only">Loading content…</span>
      <Skeleton aria-hidden="true" className="h-5 w-2/5" />
      {Array.from({ length: lines }, (_, index) => (
        <Skeleton key={index} aria-hidden="true" className={cn("h-4", index === lines - 1 ? "w-3/5" : "w-full")} />
      ))}
    </div>
  );
}

export { ContentSkeleton, PageSkeleton, Skeleton }
