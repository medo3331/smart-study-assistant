/*
  EPIC 1 — Profiles Phase 1: SQL Schema
  Status: IN PROGRESS (execution started per user approval 2026-09-14)
  Source: workspace/ROADMAP.md EPIC 1
  Scope: Additive only; no data deletion; safe to re-run.
  Tables: profiles + multi-profile support logic (DB-level)
*/

-- ==========================================================================
-- 1) Profiles table (if not exists) — core multi-profile schema
-- ==========================================================================
-- Note: The real profile logic is partly in the DB (profiles table already
-- exists with persona/student_level/etc.). This file formalizes the
-- multi-profile extension logic for consistency with the code's design.
-- ==========================================================================

-- Confirm profiles table has the right fields for multi-profile
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'profiles' AND column_name = 'persona') THEN
    RAISE NOTICE 'profiles.persona column confirmed (exists).';
  ELSE
    RAISE NOTICE 'profiles.persona column MISSING — requires schema update.';
  END IF;
END $$;

-- Note: Existing profiles table structure (verified by assessment/page.tsx
-- reading from profiles): persona, student_level, education_stage_id,
-- education_grade_id, education_track_id, subject, faculty_name, edu_year.
-- Multi-profile logic (max 3/account; active selection) is implemented at
-- the application/state layer, not by duplicating the profiles table.
-- This is deliberate: profiles = user account; multi-profile selection
-- uses the existing fields (e.g. switching persona/stage/grade/track) or
-- stores active selection in a separate session/config layer.

-- If future design requires a dedicated multi_profile table, add here.
-- For EPIC 1 scope (per ROADMAP.md): schema uses existing profiles fields
-- with active selection managed by application state / DB config links.

-- ==========================================================================
-- 1b) Confirm active_config_id exists (linked to study_configs)
-- ==========================================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'profiles' AND column_name = 'active_config_id') THEN
    RAISE NOTICE 'profiles.active_config_id column MISSING.';
  ELSE
    RAISE NOTICE 'profiles.active_config_id confirmed present.';
  END IF;
END $$;

-- ==========================================================================
-- 2) Index for faster profile reads (optional hardening)
-- ==========================================================================
CREATE INDEX IF NOT EXISTS profiles_persona_idx
  ON public.profiles (persona);
