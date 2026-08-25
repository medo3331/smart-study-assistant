import { cn } from "@/lib/cn";
import type { LucideIcon } from "lucide-react";

type Variant = "primary" | "ghost" | "success";

interface ButtonProps {
  children: React.ReactNode;
  onClick?: () => void;
  icon?: LucideIcon;
  /** Icon on the trailing edge (RTL: leading visually). Defaults to after text. */
  iconPosition?: "start" | "end";
  variant?: Variant;
  className?: string;
  disabled?: boolean;
}

/**
 * The ONE button component. Every interactive element uses it so icons,
 * sizing (h-11 / px-4), radius, and hover states stay identical everywhere.
 * Icons are always size 18 (lucide default scale) and use currentColor.
 */
const VARIANTS: Record<Variant, string> = {
  primary:
    "bg-[#7C5CFF] text-white hover:bg-[#8E72FF] shadow-[0_6px_20px_rgba(124,92,255,0.35)]",
  success:
    "bg-[#2DD4BF] text-[#06231F] hover:bg-[#3DE0CC] shadow-[0_6px_20px_rgba(45,212,191,0.30)]",
  ghost:
    "bg-white/[0.04] text-[#E7E9F5] border border-white/[0.08] hover:bg-white/[0.08]",
};

export function Button({
  children,
  onClick,
  icon: Icon,
  iconPosition = "end",
  variant = "primary",
  className,
  disabled = false,
}: ButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "inline-flex h-11 items-center justify-center gap-2 rounded-2xl px-4",
        "text-sm font-semibold transition-colors duration-200",
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7C5CFF]/60",
        VARIANTS[variant],
        disabled && "opacity-50 cursor-not-allowed",
        className
      )}
    >
      {/* In RTL, "start" of the flex row is the right edge visually. */}
      {Icon && iconPosition === "start" && <Icon size={18} aria-hidden />}
      <span>{children}</span>
      {Icon && iconPosition === "end" && <Icon size={18} aria-hidden />}
    </button>
  );
}
