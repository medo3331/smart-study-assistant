-- Phase 2.1 — University Education Foundation (minimal, normalized, RLS-safe, idempotent)
-- Source: verified — Cairo University (public institution); faculty/department names reflect verified Cairo University structures
-- NO INVENTED DATA: only 1 verified university seed + 1 verified faculty/department for test; rest empty for admin
-- Uses existing profiles (no duplicate system)
-- Backward compatible: all new profile fields nullable; school students unaffected

-- 1) University taxonomy tables (minimal, normalized)
CREATE TABLE IF NOT EXISTS public.universities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  country_id UUID REFERENCES public.countries(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  code TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_universities_code ON public.universities(code);
ALTER TABLE public.universities ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "uni_pub_read" ON public.universities;
CREATE POLICY "uni_pub_read" ON public.universities FOR SELECT USING (true);

CREATE TABLE IF NOT EXISTS public.university_faculties (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  university_id UUID NOT NULL REFERENCES public.universities(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  code TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (university_id, code)
);
CREATE INDEX IF NOT EXISTS idx_univ_fac_univ ON public.university_faculties(university_id);
ALTER TABLE public.university_faculties ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "fac_pub_read" ON public.university_faculties;
CREATE POLICY "fac_pub_read" ON public.university_faculties FOR SELECT USING (true);

CREATE TABLE IF NOT EXISTS public.university_departments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  faculty_id UUID NOT NULL REFERENCES public.university_faculties(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  code TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (faculty_id, code)
);
CREATE INDEX IF NOT EXISTS idx_univ_dept_fac ON public.university_departments(faculty_id);
ALTER TABLE public.university_departments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "dept_pub_read" ON public.university_departments;
CREATE POLICY "dept_pub_read" ON public.university_departments FOR SELECT USING (true);

CREATE TABLE IF NOT EXISTS public.university_levels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  code TEXT NOT NULL UNIQUE,
  order_index INT DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_univ_levels_code ON public.university_levels(code);
ALTER TABLE public.university_levels ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "lvl_pub_read" ON public.university_levels;
CREATE POLICY "lvl_pub_read" ON public.university_levels FOR SELECT USING (true);

CREATE TABLE IF NOT EXISTS public.university_semesters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  code TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_univ_sem_code ON public.university_semesters(code);
ALTER TABLE public.university_semesters ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "sem_pub_read" ON public.university_semesters;
CREATE POLICY "sem_pub_read" ON public.university_semesters FOR SELECT USING (true);

-- 2) Extend profiles (nullable, backward-compatible, RLS-safe via existing policies)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS university_id UUID REFERENCES public.universities(id) ON DELETE SET NULL;
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS faculty_id UUID REFERENCES public.university_faculties(id) ON DELETE SET NULL;
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS department_id UUID REFERENCES public.university_departments(id) ON DELETE SET NULL;
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS academic_level_id UUID REFERENCES public.university_levels(id) ON DELETE SET NULL;
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS semester_id UUID REFERENCES public.university_semesters(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_profiles_univ ON public.profiles(university_id);
CREATE INDEX IF NOT EXISTS idx_profiles_fac ON public.profiles(faculty_id);
CREATE INDEX IF NOT EXISTS idx_profiles_dept ON public.profiles(department_id);

-- 3) Verify seed (1 verified university + 1 verified faculty/department — for test only, not content ingestion)
-- Cairo University (public, verified) — used only as structure reference; no invented departments
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.universities WHERE code = 'CAU') THEN
    INSERT INTO public.universities (id, country_id, name, code, created_at, updated_at)
    VALUES (gen_random_uuid(), '65157053-fc04-435f-bd0e-ec10ce97d3e3', 'Cairo University', 'CAU', now(), now());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.university_faculties WHERE code = 'ENG') THEN
    INSERT INTO public.university_faculties (id, university_id, name, code, created_at, updated_at)
    SELECT gen_random_uuid(), u.id, 'Faculty of Engineering', 'ENG', now(), now()
    FROM public.universities u WHERE u.code = 'CAU';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.university_departments WHERE code = 'CSED') THEN
    INSERT INTO public.university_departments (id, faculty_id, name, code, created_at, updated_at)
    SELECT gen_random_uuid(), f.id, 'Computer Engineering', 'CSED', now(), now()
    FROM public.university_faculties f WHERE f.code = 'ENG';
  END IF;
END $$;

-- 4) Levels / Semesters (canonical — no invention, just standard university taxonomy)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.university_levels WHERE code = 'L1') THEN
    INSERT INTO public.university_levels (id, name, code, order_index, created_at, updated_at)
    VALUES (gen_random_uuid(), 'Year 1', 'L1', 1, now(), now());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.university_levels WHERE code = 'L2') THEN
    INSERT INTO public.university_levels (id, name, code, order_index, created_at, updated_at)
    VALUES (gen_random_uuid(), 'Year 2', 'L2', 2, now(), now());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.university_levels WHERE code = 'L3') THEN
    INSERT INTO public.university_levels (id, name, code, order_index, created_at, updated_at)
    VALUES (gen_random_uuid(), 'Year 3', 'L3', 3, now(), now());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.university_levels WHERE code = 'L4') THEN
    INSERT INTO public.university_levels (id, name, code, order_index, created_at, updated_at)
    VALUES (gen_random_uuid(), 'Year 4', 'L4', 4, now(), now());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.university_semesters WHERE code = 'S1') THEN
    INSERT INTO public.university_semesters (id, name, code, created_at, updated_at)
    VALUES (gen_random_uuid(), 'Semester 1', 'S1', now(), now());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.university_semesters WHERE code = 'S2') THEN
    INSERT INTO public.university_semesters (id, name, code, created_at, updated_at)
    VALUES (gen_random_uuid(), 'Semester 2', 'S2', now(), now());
  END IF;
END $$;
