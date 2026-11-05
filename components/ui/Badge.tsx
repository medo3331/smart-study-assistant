import { cn } from "@/lib/cn";
import type { ReactNode } from "react";

type BadgeVariant = "default" | "primary" | "danger" | "success" | "muted";

interface BadgeProps {
  children: ReactNode;
  variant?: BadgeVariant;
  className?: string;
}

const VARIANTS: Record<BadgeVariant, string> = {
  default:
    "bg-[var(--color-surface-2)] text-[var(--color-text-primary)] border border-[var(--color-border)]",
  primary:
    "bg-[color-mix(in_srgb,var(--color-primary)_15%,transparent)] text-[var(--color-primary)] border border-[var(--color-primary)]",
  danger:
    "bg-[color-mix(in_srgb,var(--color-danger)_15%,transparent)] text-[var(--color-danger)] border border-[var(--color-danger)]",
  success:
    "bg-[color-mix(in_srgb,var(--hl-green-fill)_15%,transparent)] text-[var(--hl-green-fill)] border border-[var(--hl-green-fill)]",
  muted: "bg-transparent text-[var(--color-text-muted)] border border-[var(--color-border)]",
};

export function Badge({ children, variant = "default", className }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium",
        VARIANTS[variant],
        className
      )}
    >
      {children}
    </span>
  );
}