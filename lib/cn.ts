/**
 * Tiny className combiner. Filters falsy values so we can write
 * cn("base", cond && "extra") without pulling in clsx/tailwind-merge.
 */
export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}
