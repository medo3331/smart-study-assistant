-- Phase 1.2C.5 — Education Taxonomy Extension (Option B — reuse-first)
-- Extends existing curricula/subjects; preserves past_exams / diagnostic / auth
-- No hard-coded values; data-driven; no AI; safe to rerun

CREATE TABLE IF NOT EXISTS public.education_stages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL CHECK (name IN ('Primary','Preparatory','Secondary','Baccalaureate','University')),
  code TEXT NOT NULL UNIQUE,
  order_index INT DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_edu_stages_code ON public.education_stages(code);
ALTER TABLE public.education_stages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "edu_stages: public read" ON public.education_stages;
CREATE POLICY "edu_stages: public read" ON public.education_stages FOR SELECT USING (true);
DROP POLICY IF EXISTS "edu_stages: admin manage" ON public.education_stages;
CREATE POLICY "edu_stages: admin manage" ON public.education_stages FOR ALL USING (exists(SELECT 1 FROM public.site_admins WHERE user_id = auth.uid()));

CREATE TABLE IF NOT EXISTS public.education_grades (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stage_id UUID NOT NULL REFERENCES public.education_stages(id) ON DELETE RESTRICT,
  name TEXT NOT NULL,  -- e.g., "Grade 1", "Year 1"
  code TEXT NOT NULL,
  order_index INT DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_edu_grades_stage ON public.education_grades(stage_id);
ALTER TABLE public.education_grades ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "edu_grades: public read" ON public.education_grades;
CREATE POLICY "edu_grades: public read" ON public.education_grades FOR SELECT USING (true);
DROP POLICY IF EXISTS "edu_grades: admin manage" ON public.education_grades;
CREATE POLICY "edu_grades: admin manage" ON public.education_grades FOR ALL USING (exists(SELECT 1 FROM public.site_admins WHERE user_id = auth.uid()));

CREATE TABLE IF NOT EXISTS public.education_tracks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stage_id UUID NOT NULL REFERENCES public.education_stages(id) ON DELETE RESTRICT,
  grade_id UUID REFERENCES public.education_grades(id) ON DELETE SET NULL,
  name TEXT NOT NULL CHECK (name IN ('Medicine & Life Sciences','Engineering & Computer Science','Business','Humanities / Arts')),
  code TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_edu_tracks_stage ON public.education_tracks(stage_id);
ALTER TABLE public.education_tracks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "edu_tracks: public read" ON public.education_tracks;
CREATE POLICY "edu_tracks: public read" ON public.education_tracks FOR SELECT USING (true);
DROP POLICY IF EXISTS "edu_tracks: admin manage" ON public.education_tracks;
CREATE POLICY "edu_tracks: admin manage" ON public.education_tracks FOR ALL USING (exists(SELECT 1 FROM public.site_admins WHERE user_id = auth.uid()));

-- Link to existing curricula (optional reference; preserves existing FKs)
ALTER TABLE public.curricula
  ADD COLUMN IF NOT EXISTS stage_id UUID REFERENCES public.education_stages(id) ON DELETE SET NULL;
ALTER TABLE public.curricula
  ADD COLUMN IF NOT EXISTS grade_id UUID REFERENCES public.education_grades(id) ON DELETE SET NULL;
ALTER TABLE public.curricula
  ADD COLUMN IF NOT EXISTS track_id UUID REFERENCES public.education_tracks(id) ON DELETE SET NULL;

COMMENT ON TABLE public.education_stages IS 'Data-driven education taxonomy — Primary/Preparatory/Secondary/Baccalaureate/University';
COMMENT ON TABLE public.education_grades IS 'Grades per stage — data-driven, not hard-coded';
COMMENT ON TABLE public.education_tracks IS 'Baccalaureate specialization tracks (optional)';
