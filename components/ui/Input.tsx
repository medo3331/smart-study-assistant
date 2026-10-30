import { cn } from "@/lib/cn";
import type { InputHTMLAttributes } from "react";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export function Input({ label, error, className, id, ...rest }: InputProps) {
  const inputId = id ?? (label ? `input-${label}` : undefined);
  return (
    <div className="flex flex-col gap-1">
      {label && (
        <label
          htmlFor={inputId}
          className="text-sm font-medium text-[var(--color-text-primary)]"
        >
          {label}
        </label>
      )}
      <input
        id={inputId}
        className={cn(
          "h-11 rounded-[var(--r-md)] border border-[var(--color-border)]",
          "bg-[var(--color-surface-1)] px-3 text-[var(--color-text-primary)]",
          "placeholder:text-[var(--color-text-muted)]",
          "focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-focus-ring)]/60",
          "disabled:opacity-50 disabled:cursor-not-allowed",
          error && "border-[var(--color-danger)]",
          className
        )}
        aria-invalid={!!error}
        aria-describedby={error ? `${inputId}-err` : undefined}
        {...rest}
      />
      {error && (
        <p
          id={`${inputId}-err`}
          className="text-xs text-[var(--color-danger)]"
          role="alert"
        >
          {error}
        </p>
      )}
    </div>
  );
}