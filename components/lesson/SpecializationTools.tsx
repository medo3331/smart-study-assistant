"use client";

import { resolveActiveSpecialization, SpecializationRegistry } from "@/lib/education/specialization";
import type { SpecializationContext } from "@/lib/education/specialization";
import { medicalSpecialization } from "@/components/lesson/MedicalTools";
import { quantitativeLabSpecialization } from "@/components/lesson/labs/ProblemSolvingLab";

export interface SpecializationToolsProps {
  /** Per-lesson context (profile + lesson + supabase) for the active specialization. */
  ctx: SpecializationContext;
}

/**
 * Specialization Tools — the lesson shell's extension-point slot.
 *
 * Wave 1 (architecture only): no specialization was registered, so
 * `resolveActiveSpecialization(ctx)` returned `null` and nothing rendered.
 * Wave 2A registers the medical specialization below; language still
 * registers nothing.
 * P6: الـ quantitative Lab (مختبر حل المشكلات) اتسجّل هنا كمان — بيشتغل
 * للمواد الحسابية/البرمجية (حسب `resolveActiveSpecialization`).
 */
export function SpecializationTools({ ctx }: SpecializationToolsProps) {
  // Register here rather than at module scope: this is a client component that
  // only ever renders on the lesson page, so the registration is guaranteed to
  // have happened before `resolveActiveSpecialization` is ever called.
  // `register` is a Map.set, so calling it on every render is idempotent.
  SpecializationRegistry.register(medicalSpecialization);
  SpecializationRegistry.register(quantitativeLabSpecialization);

  const active = resolveActiveSpecialization(ctx);
  if (!active) return null;
  return <>{active.renderTools(ctx)}</>;
}
