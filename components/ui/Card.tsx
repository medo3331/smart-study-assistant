import { cn } from "@/lib/cn";
import type { ReactNode } from "react";

interface CardProps {
  children: ReactNode;
  className?: string;
  /** Elevated surface (paper-2) vs base (paper). */
  elevated?: boolean;
}

export function Card({ children, className, elevated = false }: CardProps) {
  return (
    <div
      className={cn(
        "rounded-[var(--r-lg)] border border-[var(--color-border)] p-4",
        elevated
          ? "bg-[var(--color-surface-1)]"
          : "bg-[var(--color-surface-2)]",
        className
      )}
    >
      {children}
    </div>
  );
}