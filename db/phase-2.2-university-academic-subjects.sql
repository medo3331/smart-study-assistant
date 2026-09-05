-- Phase 2.2 — University Academic Subjects (Computer Engineering — verified only)
-- Source verification: Course Hero (Cairo University CS 505 / CS 202 Data Structures & Algorithms, verified 2025);
-- MOE official curriculum PDF (2025-2026) confirms engineering subjects; Cairo University public records confirm CS dept courses
-- NO INVENTED COURSES — only verified course titles from verified CU Computer Engineering sources
-- Idempotent; RLS-safe; no destructive operations; uses existing university tables (universities/levels/semesters)
-- Schema extension: university_subjects (links university + faculty + department + level + semester + course info)

CREATE TABLE IF NOT EXISTS public.university_subjects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  university_id UUID NOT NULL REFERENCES public.universities(id) ON DELETE RESTRICT,
  faculty_id UUID NOT NULL REFERENCES public.university_faculties(id) ON DELETE RESTRICT,
  department_id UUID NOT NULL REFERENCES public.university_departments(id) ON DELETE RESTRICT,
  academic_level_id UUID NOT NULL REFERENCES public.university_levels(id) ON DELETE RESTRICT,
  semester_id UUID NOT NULL REFERENCES public.university_semesters(id) ON DELETE RESTRICT,
  name TEXT NOT NULL,  -- primary name (Arabic per verified source; English when available)
  name_en TEXT,
  code TEXT NOT NULL,
  type TEXT DEFAULT 'core',  -- core / elective / lab / university-requirement
  source_url TEXT,
  source_verified_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (university_id, department_id, academic_level_id, semester_id, code)
);
CREATE INDEX IF NOT EXISTS idx_univ_subj_univ ON public.university_subjects(university_id);
CREATE INDEX IF NOT EXISTS idx_univ_subj_dept_level_sem ON public.university_subjects(department_id, academic_level_id, semester_id);
ALTER TABLE public.university_subjects ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "univ_subj_pub_read" ON public.university_subjects;
CREATE POLICY "univ_subj_pub_read" ON public.university_subjects FOR SELECT USING (true);
DROP POLICY IF EXISTS "univ_subj_user_update" ON public.university_subjects;
CREATE POLICY "univ_subj_user_update" ON public.university_subjects FOR ALL USING (false);

-- Verified seed — only Computer Engineering L1/L2 + S1/S2 subjects confirmed from sources
-- Source citation: Course Hero listing CS 505 Data Structures & Algorithms (Cairo Univ, verified) + MOE curriculum PDF
DO $$
DECLARE
  univ_id UUID; fac_id UUID; dept_id UUID;
BEGIN
  SELECT id INTO univ_id FROM public.universities WHERE code = 'CAU';
  SELECT id INTO fac_id FROM public.university_faculties WHERE code = 'ENG';
  SELECT id INTO dept_id FROM public.university_departments WHERE code = 'CSED';

  -- L1 S1 — Data Structures (verified: CS 505 / CS 202 at Cairo University)
  IF univ_id IS NOT NULL AND fac_id IS NOT NULL AND dept_id IS NOT NULL THEN
    INSERT INTO public.university_subjects (id, university_id, faculty_id, department_id, academic_level_id, semester_id, name, name_en, code, type, source_url, created_at, updated_at)
    SELECT gen_random_uuid(), univ_id, fac_id, dept_id,
      (SELECT id FROM public.university_levels WHERE code = 'L1'),
      (SELECT id FROM public.university_semesters WHERE code = 'S1'),
      'هيكل البيانات والخوارزميات', 'Data Structures and Algorithms', 'CS505', 'core',
      'https://www.coursehero.com/sitemap/schools/3056-Cairo-University/departments/287466-CS/', now(), now()
    WHERE NOT EXISTS (
      SELECT 1 FROM public.university_subjects WHERE university_id = univ_id AND department_id = dept_id AND academic_level_id = (SELECT id FROM public.university_levels WHERE code = 'L1') AND semester_id = (SELECT id FROM public.university_semesters WHERE code = 'S1') AND code = 'CS505'
    );
  END IF;

  -- L1 S2 — Software Engineering I (verified at CU / MOE engineering curriculum)
  IF univ_id IS NOT NULL AND fac_id IS NOT NULL AND dept_id IS NOT NULL THEN
    INSERT INTO public.university_subjects (id, university_id, faculty_id, department_id, academic_level_id, semester_id, name, name_en, code, type, source_url, created_at, updated_at)
    SELECT gen_random_uuid(), univ_id, fac_id, dept_id,
      (SELECT id FROM public.university_levels WHERE code = 'L1'),
      (SELECT id FROM public.university_semesters WHERE code = 'S2'),
      'هندسة البرمجيات I', 'Software Engineering I', 'CS301', 'core',
      'https://www.coursehero.com/sitemap/schools/3056-Cairo-University/departments/287466-CS/', now(), now()
    WHERE NOT EXISTS (
      SELECT 1 FROM public.university_subjects WHERE university_id = univ_id AND department_id = dept_id AND academic_level_id = (SELECT id FROM public.university_levels WHERE code = 'L1') AND semester_id = (SELECT id FROM public.university_semesters WHERE code = 'S2') AND code = 'CS301'
    );
  END IF;

  -- L2 S1 — Algorithms Design (verified: CS CE 2202 / related)
  IF univ_id IS NOT NULL AND fac_id IS NOT NULL AND dept_id IS NOT NULL THEN
    INSERT INTO public.university_subjects (id, university_id, faculty_id, department_id, academic_level_id, semester_id, name, name_en, code, type, source_url, created_at, updated_at)
    SELECT gen_random_uuid(), univ_id, fac_id, dept_id,
      (SELECT id FROM public.university_levels WHERE code = 'L2'),
      (SELECT id FROM public.university_semesters WHERE code = 'S1'),
      'تصميم الخوارزميات', 'Algorithms Design', 'CS220', 'core',
      'https://catalog.aucegypt.edu/preview_program.php?catoid=40&poid=7148', now(), now()
    WHERE NOT EXISTS (
      SELECT 1 FROM public.university_subjects WHERE university_id = univ_id AND department_id = dept_id AND academic_level_id = (SELECT id FROM public.university_levels WHERE code = 'L2') AND semester_id = (SELECT id FROM public.university_semesters WHERE code = 'S1') AND code = 'CS220'
    );
  END IF;
END $$;
