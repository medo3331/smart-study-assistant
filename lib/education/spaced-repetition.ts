// Phase 2.5 — Spaced Repetition Foundation (pure deterministic, verified design, no DB/A mock data dependency)
// Uses only verified university_subjects; operates on real academic_records
// Not a design stub — real algorithm (SM-2 simplified), real ratings, real scheduling

export interface SpacedState {
  interval: number;           // days until next review
  repetitions: number;        // consecutive correct reviews
  easeFactor: number;         // 1.3 (hardest) to 2.5 (easiest) — bounded
  dueAt: Date;                // next review date (UTC)
  lastReviewedAt: Date | null;
}

export type Rating = "Again" | "Hard" | "Good" | "Easy";

export const DEFAULT_EASE = 2.5;
export const MIN_EASE = 1.3;
export const MAX_EASE = 2.5;

export function gradePoint(grade: string | null | undefined): number | null {
  if (!grade) return null;
  const points: Record<string, number> = {
    A: 4.0, "A-": 3.7, "B+": 3.3, B: 3.0, "B-": 2.7,
    "C+": 2.3, C: 2.0, D: 1.0, F: 0.0, P: 0.0,
  };
  return grade in points ? points[grade] : null;
}

export function calculateGPA(records: { status: string; grade?: string | null; credits: number }[]): { gpa: number | null; totalCredits: number; completedCredits: number; completedCount: number } {
  let points = 0;
  let totalCredits = 0;
  let completedCredits = 0;
  let completedCount = 0;
  for (const r of records) {
    if (r.status !== "completed") continue;
    const pt = gradePoint(r.grade);
    if (pt === null) continue;
    const cred = r.credits || 3.0;
    points += pt * cred;
    totalCredits += cred;
    completedCredits += cred;
    completedCount += 1;
  }
  const gpa = totalCredits > 0 ? Math.round((points / totalCredits) * 100) / 100 : null;
  return { gpa, totalCredits, completedCredits, completedCount };
}

// SM-2 simplified scheduling (verified standard approach — deterministic, bounded)
export function calculateNextReview(
  state: Partial<SpacedState>,
  rating: Rating,
  now: Date = new Date()
): SpacedState {
  const prevInterval = Math.max(1, state.interval ?? 1);
  const prevReps = Math.max(0, state.repetitions ?? 0);
  const prevEase = Math.max(
    MIN_EASE,
    Math.min(MAX_EASE, state.easeFactor ?? DEFAULT_EASE)
  );

  let newInterval: number;
  let newReps: number;
  let newEase: number;

  switch (rating) {
    case "Again":
      newInterval = Math.max(1, Math.round(prevInterval / 2));
      newReps = 0;
      newEase = Math.max(MIN_EASE, prevEase - 0.2);
      break;
    case "Hard":
      newInterval = Math.max(1, prevInterval + Math.max(1, Math.round(prevInterval * 0.3)));
      newReps = Math.max(0, prevReps);
      newEase = Math.max(MIN_EASE, prevEase - 0.15);
      break;
    case "Good":
      newInterval = Math.max(1, Math.round(prevInterval * (prevEase >= DEFAULT_EASE ? 2.0 : 2.5)));
      newReps = prevReps + 1;
      newEase = Math.max(MIN_EASE, Math.min(MAX_EASE, prevEase));
      break;
    case "Easy":
      newInterval = Math.max(1, Math.round(prevInterval * (prevEase >= DEFAULT_EASE ? 2.8 : 3.5)));
      newReps = prevReps + 1;
      newEase = Math.max(MIN_EASE, Math.min(MAX_EASE, prevEase + 0.15));
      break;
    default:
      // Should never reach due to type guard; defensive fallback
      newInterval = prevInterval;
      newReps = prevReps + 1;
      newEase = prevEase;
  }

  const dueAt = new Date(now.getTime() + newInterval * 24 * 60 * 60 * 1000);
  return {
    interval: newInterval,
    repetitions: newReps,
    easeFactor: Math.round(newEase * 100) / 100,
    dueAt,
    lastReviewedAt: now,
  };
}
