import { cn } from "@/lib/cn";
import type { LucideIcon } from "lucide-react";
import { AlertTriangle } from "lucide-react";

interface ErrorStateProps {
  title?: string;
  message?: string;
  icon?: LucideIcon;
  onRetry?: () => void;
  className?: string;
}

export function ErrorState({
  title = "حدث خطأ",
  message,
  icon: Icon = AlertTriangle,
  onRetry,
  className,
}: ErrorStateProps) {
  return (
    <div
      role="alert"
      className={cn(
        "flex flex-col items-center gap-3 rounded-[var(--r-lg)] border border-[var(--color-danger)]",
        "bg-[color-mix(in_srgb,var(--color-danger)_8%,transparent)] p-6 text-center",
        className
      )}
    >
      <Icon size={28} className="text-[var(--color-danger)]" aria-hidden />
      <h3 className="text-base font-semibold text-[var(--color-text-primary)]">
        {title}
      </h3>
      {message && (
        <p className="text-sm text-[var(--color-text-muted)]">{message}</p>
      )}
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="mt-1 text-sm font-medium text-[var(--color-danger)] underline underline-offset-2"
        >
          إعادة المحاولة
        </button>
      )}
    </div>
  );
}