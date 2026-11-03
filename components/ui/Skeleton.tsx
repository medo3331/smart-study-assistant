import { cn } from "@/lib/cn";

interface SkeletonProps {
  className?: string;
  /** Render as circle (avatar placeholder). */
  circle?: boolean;
}

export function Skeleton({ className, circle = false }: SkeletonProps) {
  return (
    <div
      aria-hidden
      className={cn(
        "animate-pulse bg-[var(--color-surface-2)]",
        circle ? "rounded-full" : "rounded-[var(--r-md)]",
        className
      )}
    />
  );
}