import { cn } from "@/lib/cn";
import type { LucideIcon } from "lucide-react";

type Variant = "primary" | "ghost" | "success" | "danger";

interface ButtonProps {
  children: React.ReactNode;
  onClick?: () => void;
  icon?: LucideIcon;
  /** Icon on the trailing edge (RTL: leading visually). Defaults to after text. */
  iconPosition?: "start" | "end";
  variant?: Variant;
  className?: string;
  disabled?: boolean;
  loading?: boolean;
  type?: "button" | "submit" | "reset";
}

/**
 * The ONE button component. Every interactive element uses it so icons,
 * sizing (h-11 / px-4), radius, and hover states stay identical everywhere.
 * Icons are always size 18 (lucide default scale) and use currentColor.
 *
 * V2: variants consume semantic tokens (--color-primary, --color-danger, etc.)
 * so they adapt to all 8 themes + shop packs.
 */
const VARIANTS: Record<Variant, string> = {
  primary:
    "bg-[var(--color-primary)] text-[var(--on-marker,#fff)] hover:opacity-90 shadow-[0_6px_20px_color-mix(in_srgb,var(--color-primary)_35%,transparent)]",
  success:
    "bg-[var(--hl-green-fill)] text-[var(--on-marker,#fff)] hover:opacity-90 shadow-[0_6px_20px_color-mix(in_srgb,var(--hl-green-fill)_30%,transparent)]",
  danger:
    "border border-[var(--color-danger)] text-[var(--color-danger)] bg-transparent hover:bg-[color-mix(in_srgb,var(--color-danger)_12%,transparent)]",
  ghost:
    "bg-[var(--paper-3)] text-[var(--ink)] border border-[var(--rule)] hover:bg-[var(--paper-2)]",
};

export function Button({
  children,
  onClick,
  icon: Icon,
  iconPosition = "end",
  variant = "primary",
  className,
  disabled = false,
  loading = false,
  type = "button",
}: ButtonProps) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled || loading}
      className={cn(
        "inline-flex h-11 items-center justify-center gap-2 rounded-[var(--r-md)] px-4",
        "text-sm font-semibold transition-colors duration-200",
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-focus-ring)]/60",
        VARIANTS[variant],
        (disabled || loading) && "opacity-50 cursor-not-allowed",
        className
      )}
    >
      {loading && (
        <span
          aria-hidden
          className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"
        />
      )}
      {Icon && iconPosition === "start" && !loading && <Icon size={18} aria-hidden />}
      <span>{children}</span>
      {Icon && iconPosition === "end" && !loading && <Icon size={18} aria-hidden />}
    </button>
  );
}
