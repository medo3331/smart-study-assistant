-- UX Phase — Role + Education Onboarding: minimal profile extension
-- Backward compatible; RLS covered by existing profiles policies (owner-only update / public read)
-- No new user/profile system; uses existing profiles table
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS education_stage_id UUID REFERENCES public.education_stages(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS education_grade_id UUID REFERENCES public.education_grades(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS education_track_id UUID REFERENCES public.education_tracks(id) ON DELETE SET NULL;

-- Index for taxonomy reads (no impact on write)
CREATE INDEX IF NOT EXISTS idx_profiles_edu_stage ON public.profiles(education_stage_id);
CREATE INDEX IF NOT EXISTS idx_profiles_edu_grade ON public.profiles(education_grade_id);
CREATE INDEX IF NOT EXISTS idx_profiles_edu_track ON public.profiles(education_track_id);
