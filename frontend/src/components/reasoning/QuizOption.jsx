import { Check, CircleX } from "lucide-react";
import { cn } from "../../lib/utils";

export default function QuizOption({
  label,
  children,
  selected = false,
  correct = false,
  studentWrong = false,
  disabled = false,
  onClick,
  className = "",
  ...props
}) {
  const statusLabel = correct
    ? "Correct answer"
    : studentWrong
      ? "Your answer"
      : selected
        ? "Your answer"
        : "";
  return (
    <button
      type="button"
      disabled={disabled}
      aria-pressed={selected || undefined}
      onClick={onClick}
      className={cn(
        "grid h-auto min-h-14 min-w-0 touch-manipulation grid-cols-[2rem_minmax(0,1fr)_auto] items-center gap-3 overflow-visible rounded-xl border border-input bg-card px-4 py-3 text-left text-foreground transition-[border-color,background-color,box-shadow,transform] duration-150 enabled:hover:border-primary/55 enabled:active:scale-[.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-default motion-reduce:transform-none motion-reduce:transition-none",
        selected &&
          !correct &&
          !studentWrong &&
          "border-primary bg-primary-subtle shadow-[0_0_0_2px_hsl(var(--primary)/.12)] dark:bg-primary/15",
        correct &&
          "border-success/45 bg-success-subtle text-success-subtle-foreground",
        studentWrong &&
          "border-destructive/45 bg-destructive-subtle text-foreground",
        className,
      )}
      {...props}
    >
      <span
        aria-hidden="true"
        className={cn(
          "grid h-[1.9rem] w-[1.9rem] place-items-center rounded-lg border text-[.8rem] font-extrabold",
          correct
            ? "border-success bg-success text-success-foreground"
            : studentWrong
              ? "border-destructive bg-destructive text-destructive-foreground"
              : selected
                ? "border-primary bg-primary text-primary-foreground"
                : "border-input text-muted-foreground",
        )}
      >
        {correct ? (
          <Check size={16} />
        ) : studentWrong ? (
          <CircleX size={16} />
        ) : (
          label
        )}
      </span>
      <span className="min-w-0 [&>.math-content]:w-full [&>.math-content]:min-w-0 [&>.math-content]:max-w-none [&_.generated-doc-markdown]:font-sans [&_.generated-doc-markdown]:text-[.94rem] [&_.generated-doc-markdown]:leading-[1.55]">
        {children}
      </span>
      {statusLabel && (
        <span
          className={cn(
            "rounded-full px-2 py-1 text-[12px] font-semibold",
            correct
              ? "bg-success/10 text-success-subtle-foreground"
              : studentWrong
                ? "bg-destructive/10 text-destructive-subtle-foreground"
                : "bg-primary/10 text-primary-subtle-foreground",
          )}
        >
          {statusLabel}
        </span>
      )}
    </button>
  );
}
