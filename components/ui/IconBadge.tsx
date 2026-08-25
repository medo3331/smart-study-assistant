import { cn } from "@/lib/cn";
import type { LucideIcon } from "lucide-react";

interface IconBadgeProps {
  icon: LucideIcon | React.ComponentType<{ size?: number; className?: string; strokeWidth?: number }>;
  /** Tailwind text color for the glyph, e.g. "text-[#FB923C]". */
  color?: string;
  /** Tailwind bg for the rounded chip, e.g. "bg-[#FB923C]/15". */
  bg?: string;
  size?: number;
  className?: string;
}

/**
 * Uniform circular icon chip. Used by stat cards and list rows so every icon
 * shares the same 40px chip, same padding, same 18px glyph size — no drift.
 */
export function IconBadge({
  icon: Icon,
  color = "text-[#B69CFF]",
  bg = "bg-[#7C5CFF]/15",
  size = 40,
  className,
}: IconBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-xl",
        bg,
        color,
        className
      )}
      style={{ width: size, height: size }}
    >
      <Icon size={18} aria-hidden />
    </span>
  );
}
