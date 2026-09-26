// =============================================================================
// Wave 1 — Lesson Specialization extension points (Architecture only).
//
// The Lesson page is a SHELL composed of:
//   Header | Progress | Content | Sources | Notes | AI Assistant | Practice
//   └── Specialization Tools   <-- this slot
//
// This module defines the *contract* + extension-point registry for the three
// domain-specialized tool systems that MAY plug into a lesson:
//   - LanguageTools   ("language")
//   - ProgrammingTools("programming")
//   - MedicalTools    ("medical")
//
// Per the Wave 1 spec: NONE of the three are IMPLEMENTED yet — only the
// interface, the registry, and the shell slot exist, so the shell is extensible
// without adding any new feature or changing lesson behavior.
// =============================================================================

import type { ReactNode } from "react";

/** Identifier of a domain specialization. The 3 systems Wave 1 reserves slots for. */
export type SpecializationId = "language" | "programming" | "medical";

/**
 * Per-lesson context handed to a specialization's tool panel.
 * Built by the lesson page from existing LessonContext state + the supabase client,
 * and passed through `<SpecializationTools ctx={...} />` to any active specialization.
 */
export interface SpecializationContext {
  lesson: {
    dayId: string;
    topic: string;
    description: string;
    subject: string;
    learningStyle: string;
  };
  profile: {
    stage?: string;
    grade?: string;
    track?: string;
    faculty?: string;
    /** e.g. "language" | "programming" | "medical" — future signal used for resolution. */
    field?: string | null;
  };
  planProgress: { completed: number; total: number } | null;
  /** Supabase client, exposed to specializations for their own server actions. */
  supabase: unknown;
}

/**
 * Contract every specialization tool panel must implement.
 *
 * LanguageTools / ProgrammingTools / MedicalTools implement this interface in a
 * LATER wave and register themselves via `SpecializationRegistry.register(...)`.
 */
export interface LessonSpecialization {
  id: SpecializationId;
  name: string;
  icon?: ReactNode;
  /** Higher priority wins when more than one specialization could resolve. */
  priority: number;
  /** Render this specialization's tools for the current lesson. */
  renderTools(ctx: SpecializationContext): ReactNode;
}

// -----------------------------------------------------------------------------
// Extension-point registry.
// Wave 1: intentionally empty (no specialization is implemented, so nothing is
// registered). This is the single place later waves plug their tools into.
// -----------------------------------------------------------------------------
const REGISTRY: Map<SpecializationId, LessonSpecialization> = new Map();

export const SpecializationRegistry = {
  register(spec: LessonSpecialization): void {
    REGISTRY.set(spec.id, spec);
  },
  unregister(id: SpecializationId): void {
    REGISTRY.delete(id);
  },
  get(id: SpecializationId): LessonSpecialization | undefined {
    return REGISTRY.get(id);
  },
  list(): LessonSpecialization[] {
    return [...REGISTRY.values()].sort((a, b) => b.priority - a.priority);
  },
};

export type ActiveSpecialization = LessonSpecialization | null;

/**
 * Resolve active specialization based on lesson subject (not student profile).
 *
 * Wave 1: the registry was empty, so resolution always yielded null.
 * Wave 2A: specializations register themselves, and a registered specialization
 * is returned ONLY when the lesson subject matches its domain. An unmatched
 * subject resolves to `null` (see the fix note at the end of this function).
 */
export function resolveActiveSpecialization(context?: SpecializationContext): ActiveSpecialization {
  if (!context?.lesson?.subject) {
    return null;
  }

  const subject = context.lesson.subject.trim();

  // 1. Medical lesson check (subject-based with word boundaries)
  const isMedical = /\bmed(icine|ical)?\b/i.test(subject) || /طب|صيدلة|تشريح|علاج|pathology/i.test(subject);
  if (isMedical) {
    return SpecializationRegistry.get("medical") ?? null;
  }

  // 2. Language lesson check
  const isLanguage = /\b(english|french|spanish|german|arabic|grammar)\b/i.test(subject) || /لغة|نحو|إنجليزي|فرنسي|ألماني/i.test(subject);
  if (isLanguage) {
    return SpecializationRegistry.get("language") ?? null;
  }

  // 3. Programming lesson check
  const isProgramming = /\b(programming|coding|javascript|typescript|python|c\+\+|software|web)\b/i.test(subject) || /برمجة|كود|تطوير/i.test(subject);
  if (isProgramming) {
    return SpecializationRegistry.get("programming") ?? null;
  }

  // 4. Subject matches no specialization domain.
  //
  // Wave 2A (fix): this previously returned the first *registered*
  // specialization regardless of subject, so registering "medical" would have
  // made the medical tools panel appear on EVERY lesson that did not match
  // medical/language/programming. That is exactly the false-positive
  // regression this file is supposed to prevent.
  //
  // Unmatched subject now resolves to null: the lesson shell renders nothing
  // extra, which is the correct Wave 1 behaviour for a generic lesson.
  return null;
}
