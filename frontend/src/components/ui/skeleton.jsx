import { cn } from "@/lib/utils"

function Skeleton({
  className,
  ...props
}) {
  return (
    <div
      data-slot="skeleton"
      aria-hidden="true"
      className={cn("animate-pulse rounded-md bg-surface-elevated motion-reduce:animate-none", className)}
      {...props} />
  );
}

export { Skeleton }
