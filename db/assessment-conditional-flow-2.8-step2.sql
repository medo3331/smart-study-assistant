-- Step 2 — Assessment conditional UI: profile columns for university branch
-- Complements 2.8-step1.sql; idempotent; safe to rerun; RLS via existing policies
-- These columns are what assessment/page.tsx reads/writes for the الجامعة branch.
-- Flat storage (per user choice); grad/freelancer branch keeps them NULL.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS faculty_name TEXT;
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS edu_year INT;
COMMENT ON COLUMN public.profiles.faculty_name IS 'Assessment Step 2 — university branch: faculty/specialty free text (NULL otherwise)';
COMMENT ON COLUMN public.profiles.edu_year IS 'Assessment Step 2 — university branch: academic year 1-5 (NULL otherwise)';
CREATE INDEX IF NOT EXISTS idx_profiles_faculty_name ON public.profiles(faculty_name);
CREATE INDEX IF NOT EXISTS idx_profiles_edu_year ON public.profiles(edu_year);
