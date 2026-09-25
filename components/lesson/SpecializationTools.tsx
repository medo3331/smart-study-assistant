"use client";

import { resolveActiveSpecialization } from "@/lib/education/specialization";
import type { SpecializationContext } from "@/lib/education/specialization";

export interface SpecializationToolsProps {
  /** Per-lesson context (profile + lesson + supabase) for the active specialization. */
  ctx: SpecializationContext;
}

/**
 * Specialization Tools — the lesson shell's extension-point slot.
 *
 * Wave 1 (architecture only): no specialization is registered, so
 * `resolveActiveSpecialization(ctx)` returns `null` and nothing is rendered.
 * LanguageTools / ProgrammingTools / MedicalTools plug in HERE by registering
 * with `SpecializationRegistry` in a later wave — no change to this component.
 */
export function SpecializationTools({ ctx }: SpecializationToolsProps) {
  const active = resolveActiveSpecialization(ctx);
  if (!active) return null;
  return <>{active.renderTools(ctx)}</>;
}
