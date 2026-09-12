-- Phase 3 — Onboarding learning profile: subjects + goals + preferences
-- ⚠️ APPLY THIS MIGRATION BEFORE DEPLOYING the onboarding UI that writes it.
-- Without these columns/table, persist() fails (unknown columns) and users
-- cannot complete onboarding. Idempotent — safe to rerun.
--
-- Design notes:
--   - goals: TEXT[] whitelist (same pattern as profiles.interests).
--   - learning_style: single TEXT whitelist (single-select UI).
--   - user_subjects: one row per (user, subject); school and university
--     subjects live in SEPARATE catalog tables, so the link row carries two
--     nullable FKs with an exactly-one CHECK (never a blind TEXT id).
--   - IDs in options.ts must match the CHECK whitelists below.

-- 1) Profile columns
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS goals TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS learning_style TEXT;

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_goals_check;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_goals_check
  CHECK (goals <@ ARRAY['excel', 'pass', 'review']::TEXT[]);

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_learning_style_check;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_learning_style_check
  CHECK (learning_style IS NULL OR learning_style IN ('simple', 'detailed', 'fast'));

-- 2) Subject selections (both manifolds)
CREATE TABLE IF NOT EXISTS public.user_subjects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  subject_id UUID REFERENCES public.subjects(id) ON DELETE CASCADE,
  university_subject_id UUID REFERENCES public.university_subjects(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT user_subjects_exactly_one CHECK (
    (subject_id IS NOT NULL AND university_subject_id IS NULL) OR
    (subject_id IS NULL AND university_subject_id IS NOT NULL)
  )
);

-- One selection per (user, subject); NULLs never collide thanks to exactly_one.
CREATE UNIQUE INDEX IF NOT EXISTS uq_user_subjects_school
  ON public.user_subjects (user_id, subject_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_user_subjects_uni
  ON public.user_subjects (user_id, university_subject_id);
CREATE INDEX IF NOT EXISTS idx_user_subjects_user
  ON public.user_subjects (user_id);

-- 3) RLS: owner-only (mirrors profiles owner policy; catalogs stay public-read)
ALTER TABLE public.user_subjects ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "user_subjects: owner all" ON public.user_subjects;
CREATE POLICY "user_subjects: owner all" ON public.user_subjects
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- 4) Verification (run after applying; all must return rows/zero-error)
-- SELECT column_name FROM information_schema.columns
--  WHERE table_name = 'profiles' AND column_name IN ('goals', 'learning_style');
-- SELECT COUNT(*) FROM public.user_subjects;  -- 0 on fresh apply
