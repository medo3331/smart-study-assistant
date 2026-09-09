// Primary Experience Resolver — Phase PRIMARY Foundation
// Abstraction to determine which experience to show based on education context.
// Future-ready for preparatory/secondary/baccalaureate/university, but ONLY primary is implemented now.

import type { EducationContext } from "./context";

export type ExperienceKind =
  | "primary"
  | "preparatory"
  | "secondary"
  | "baccalaureate"
  | "university"
  | "generic";

export interface StageRow {
  id: string;
  code: string;
  name: string;
}

// Mapping from DB stage code (upper-case) to experience kind
const CODE_TO_KIND: Record<string, ExperienceKind> = {
  PRIMARY: "primary",
  PREPARATORY: "preparatory",
  SECONDARY: "secondary",
  BACCALAUREATE: "baccalaureate",
};

export function codeToExperience(code: string | null | undefined): ExperienceKind {
  if (!code) return "generic";
  const upper = code.trim().toUpperCase();
  return CODE_TO_KIND[upper] ?? "generic";
}

/**
 * Sync resolver — use when stage code is already known (e.g. after fetching education_stages row).
 * persona must be student for school experiences; otherwise returns generic.
 */
export function resolveEducationExperience(
  ctx: Partial<EducationContext> | null,
  stageCode: string | null | undefined
): ExperienceKind {
  if (!ctx || !stageCode) return "generic";
  // University is separate branch (has university_id)
  if (ctx.universityId) return "university";
  if (ctx.persona && ctx.persona !== "student" && ctx.persona !== null) {
    // grad / freelancer never get school child experience
    return "generic";
  }
  return codeToExperience(stageCode);
}

export function isPrimaryExperience(
  ctx: Partial<EducationContext> | null,
  stageCode: string | null | undefined
): boolean {
  return resolveEducationExperience(ctx, stageCode) === "primary";
}

// Helper to find stage row by id from a cached list (client-side)
export function findStageRow(stages: StageRow[], stageId: string | null | undefined): StageRow | null {
  if (!stageId || !stages.length) return null;
  return stages.find((s) => s.id === stageId) ?? null;
}
