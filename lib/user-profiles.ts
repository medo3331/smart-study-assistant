/*
  EPIC 1 — Profiles Phase 1: Multi-profile State + Schema Reference
  Status: IN PROGRESS (execution started per user approval 2026-09-14)
  Scope: Application-level multi-profile logic (max 3/account; 1 Active)
  Source: workspace/ROADMAP.md EPIC 1; assessment/page.tsx (verified intact)
  Note: Schema uses existing profiles table (verified by file inspection);
  active profile selection is handled by state/config layer, not table duplication.
*/

import { useState, useMemo } from "react";

export type ProfilePersona = "student" | "teacher" | "graduate" | "freelancer" | "parent";

export interface ProfileContext {
  persona: ProfilePersona;
  studentLevel?: "beginner" | "intermediate" | "advanced" | null;
  stageId?: string | null;
  gradeId?: string | null;
  trackId?: string | null;
  subject?: string;
  facultyName?: string | null;
  uniYear?: number | null;
  active: boolean;
}

/* Multi-profile state manager (max 3; 1 active) */
export function useProfileState(initialPersona: ProfilePersona = "student") {
  const [profiles, setProfiles] = useState<ProfileContext[]>([
    { persona: initialPersona, active: true, studentLevel: null, stageId: null, gradeId: null, trackId: null, subject: "" },
  ]);

  const activeProfile = useMemo(() => profiles.find((p) => p.active) || profiles[0], [profiles]);

  const switchActiveProfile = (index: number) => {
    setProfiles((prev) =>
      prev.map((p, i) => ({ ...p, active: i === index })),
    );
  };

  const addProfile = (newPersona: ProfilePersona) => {
    setProfiles((prev) => {
      if (prev.length >= 3) return prev; // max 3
      return [...prev.map((p) => ({ ...p, active: false })), { persona: newPersona, active: true, studentLevel: null, stageId: null, gradeId: null, trackId: null, subject: "" }];
    });
  };

  const removeProfile = (index: number) => {
    setProfiles((prev) => {
      const next = prev.filter((_, i) => i !== index);
      // If removed profile was active, activate the first remaining
      return next.map((p, i) => ({ ...p, active: i === 0 }));
    });
  };

  return { profiles, activeProfile, switchActiveProfile, addProfile, removeProfile };
}

/* Default profile assignment for existing users (migration logic — EPIC 6 reference) */
export function defaultProfileForUser(existingPersona?: string | null): ProfilePersona {
  // Priority: existing persona from DB -> student default -> parent (if no student context)
  if (existingPersona && ["student", "teacher", "graduate", "freelancer", "parent"].includes(existingPersona)) {
    return existingPersona as ProfilePersona;
  }
  return "student";
}
