import { cn } from "@/lib/cn";

interface GlassCardProps {
  children: React.ReactNode;
  className?: string;
  /** Optional subtle top glow (brand) — used by the most prominent cards. */
  glow?: boolean;
}

/**
 * Glassmorphism surface: #0D1029 @ ~70% opacity + backdrop-blur + hairline
 * border in white/[0.06]. This is the single card primitive reused by every
 * card in the app so hierarchy comes from placement/size, not from color drift.
 */
export function GlassCard({ children, className, glow }: GlassCardProps) {
  return (
    <div
      className={cn(
        "relative rounded-[24px] border border-white/[0.06]",
        "bg-[#0D1029]/70 backdrop-blur-xl",
        "shadow-[0_8px_30px_rgba(0,0,0,0.35)]",
        glow && "before:absolute before:inset-x-0 before:top-0 before:h-px before:bg-gradient-to-r before:from-transparent before:via-[#7C5CFF]/60 before:to-transparent",
        className
      )}
    >
      {children}
    </div>
  );
}
