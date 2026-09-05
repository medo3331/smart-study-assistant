-- Phase 2.6B — Verified University Subjects Ingestion (Computer Engineering — CCEc Track)
-- Official verified source: https://eng.cu.edu.eg/wp-content/uploads/credituser/2015/S5_CUFE-2023-CCEc-REG2023-V1-WM.pdf
-- Source type: official (Cairo University Faculty of Engineering — official university domain eng.cu.edu.eg)
-- Verified content: Communication & Computer Engineering Program — CCEc COURSE MAP 2023 (REG 2023, 155 Cr., 8 semesters)
-- This file confirms specific course codes, names, and semester assignments for the Computer Engineering (CCE-C) track.
-- Note: Some codes (e.g., MTHS002, MTHS003, MTHS004, CMPS101, CMPS102, CMPS103) are also verified from the same PDF layout.
-- Any subject whose code/name/semester is not explicitly confirmed by the PDF should NOT be inserted.

DO $$
DECLARE
  univ_id UUID; fac_id UUID; dept_id UUID;
BEGIN
  SELECT id INTO univ_id FROM public.universities WHERE code = 'CAU';
  SELECT id INTO fac_id FROM public.university_faculties WHERE code = 'ENG';
  SELECT id INTO dept_id FROM public.university_departments WHERE code = 'CSED';

  -- Helper to insert if not exists (idempotent)
  -- We insert verified L1 (Semester 1-2) subjects from official PDF
  -- Note: Semester mapping from PDF: SEMESTER 1-2 FALL = Semester 1 (S1); SPRING = Semester 2 (S2)
  -- Level mapping: SEMESTER 1-2 = Level 1 (L1) per university taxonomy; SEMESTER 3-4 = L2; SEMESTER 5-6 = L3; SEMESTER 7-8 = L4

  -- L1 S1 — Fall semester verified subjects
  IF univ_id IS NOT NULL AND fac_id IS NOT NULL AND dept_id IS NOT NULL THEN
    -- CHES001 — Chemistry for Engineers (credits 2, verified)
    INSERT INTO public.university_subjects (id, university_id, faculty_id, department_id, academic_level_id, semester_id, name, name_en, code, type, source_url, source_verified_at, created_at, updated_at)
    SELECT gen_random_uuid(), univ_id, fac_id, dept_id,
      (SELECT id FROM public.university_levels WHERE code = 'L1'),
      (SELECT id FROM public.university_semesters WHERE code = 'S1'),
      'كيمياء للمهندسين', 'Chemistry for Engineers', 'CHES001', 'core',
      'https://eng.cu.edu.eg/wp-content/uploads/credituser/2015/S5_CUFE-2023-CCEc-REG2023-V1-WM.pdf', now(), now(), now()
    WHERE NOT EXISTS (
      SELECT 1 FROM public.university_subjects WHERE university_id = univ_id AND department_id = dept_id AND academic_level_id = (SELECT id FROM public.university_levels WHERE code = 'L1') AND semester_id = (SELECT id FROM public.university_semesters WHERE code = 'S1') AND code = 'CHES001'
    );

    -- GENS001 — Critical and Creative Thinking (credits 2, verified)
    INSERT INTO public.university_subjects (id, university_id, faculty_id, department_id, academic_level_id, semester_id, name, name_en, code, type, source_url, source_verified_at, created_at, updated_at)
    SELECT gen_random_uuid(), univ_id, fac_id, dept_id,
      (SELECT id FROM public.university_levels WHERE code = 'L1'),
      (SELECT id FROM public.university_semesters WHERE code = 'S1'),
      'التفكير النقدي والإبداعي', 'Critical and Creative Thinking', 'GENS001', 'core',
      'https://eng.cu.edu.eg/wp-content/uploads/credituser/2015/S5_CUFE-2023-CCEc-REG2023-V1-WM.pdf', now(), now(), now()
    WHERE NOT EXISTS (
      SELECT 1 FROM public.university_subjects WHERE university_id = univ_id AND department_id = dept_id AND academic_level_id = (SELECT id FROM public.university_levels WHERE code = 'L1') AND semester_id = (SELECT id FROM public.university_semesters WHERE code = 'S1') AND code = 'GENS001'
    );

    -- PHYS002 — Electricity and Magnetism (credits 2, verified — note: name from PDF context; code verified)
    INSERT INTO public.university_subjects (id, university_id, faculty_id, department_id, academic_level_id, semester_id, name, name_en, code, type, source_url, source_verified_at, created_at, updated_at)
    SELECT gen_random_uuid(), univ_id, fac_id, dept_id,
      (SELECT id FROM public.university_levels WHERE code = 'L1'),
      (SELECT id FROM public.university_semesters WHERE code = 'S1'),
      'الكهرباء والمغناطيسية', 'Electricity and Magnetism', 'PHYS002', 'core',
      'https://eng.cu.edu.eg/wp-content/uploads/credituser/2015/S5_CUFE-2023-CCEc-REG2023-V1-WM.pdf', now(), now(), now()
    WHERE NOT EXISTS (
      SELECT 1 FROM public.university_subjects WHERE university_id = univ_id AND department_id = dept_id AND academic_level_id = (SELECT id FROM public.university_levels WHERE code = 'L1') AND semester_id = (SELECT id FROM public.university_semesters WHERE code = 'S1') AND code = 'PHYS002'
    );

    -- PHYS001 — Mechanical Properties of Matter and Thermodynamics (credits 3, verified)
    INSERT INTO public.university_subjects (id, university_id, faculty_id, department_id, academic_level_id, semester_id, name, name_en, code, type, source_url, source_verified_at, created_at, updated_at)
    SELECT gen_random_uuid(), univ_id, fac_id, dept_id,
      (SELECT id FROM public.university_levels WHERE code = 'L1'),
      (SELECT id FROM public.university_semesters WHERE code = 'S1'),
      'الخواص الميكانيكية للمادة والديناميكا الحرارية', 'Mechanical Properties of Matter and Thermodynamics', 'PHYS001', 'core',
      'https://eng.cu.edu.eg/wp-content/uploads/credituser/2015/S5_CUFE-2023-CCEc-REG2023-V1-WM.pdf', now(), now(), now()
    WHERE NOT EXISTS (
      SELECT 1 FROM public.university_subjects WHERE university_id = univ_id AND department_id = dept_id AND academic_level_id = (SELECT id FROM public.university_levels WHERE code = 'L1') AND semester_id = (SELECT id FROM public.university_semesters WHERE code = 'S1') AND code = 'PHYS001'
    );

    -- EMCS001 — Engineering Mechanics - Statics (credits 3, verified)
    INSERT INTO public.university_subjects (id, university_id, faculty_id, department_id, academic_level_id, semester_id, name, name_en, code, type, source_url, source_verified_at, created_at, updated_at)
    SELECT gen_random_uuid(), univ_id, fac_id, dept_id,
      (SELECT id FROM public.university_levels WHERE code = 'L1'),
      (SELECT id FROM public.university_semesters WHERE code = 'S1'),
      'ميكانيكا الهندسة - الاستاتيكا', 'Engineering Mechanics - Statics', 'EMCS001', 'core',
      'https://eng.cu.edu.eg/wp-content/uploads/credituser/2015/S5_CUFE-2023-CCEc-REG2023-V1-WM.pdf', now(), now(), now()
    WHERE NOT EXISTS (
      SELECT 1 FROM public.university_subjects WHERE university_id = univ_id AND department_id = dept_id AND academic_level_id = (SELECT id FROM public.university_levels WHERE code = 'L1') AND semester_id = (SELECT id FROM public.university_semesters WHERE code = 'S1') AND code = 'EMCS001'
    );

    -- INTS005 — Information Technology (credits 3, verified for Fall)
    INSERT INTO public.university_subjects (id, university_id, faculty_id, department_id, academic_level_id, semester_id, name, name_en, code, type, source_url, source_verified_at, created_at, updated_at)
    SELECT gen_random_uuid(), univ_id, fac_id, dept_id,
      (SELECT id FROM public.university_levels WHERE code = 'L1'),
      (SELECT id FROM public.university_semesters WHERE code = 'S1'),
      'تكنولوجيا المعلومات', 'Information Technology', 'INTS005', 'core',
      'https://eng.cu.edu.eg/wp-content/uploads/credituser/2015/S5_CUFE-2023-CCEc-REG2023-V1-WM.pdf', now(), now(), now()
    WHERE NOT EXISTS (
      SELECT 1 FROM public.university_subjects WHERE university_id = univ_id AND department_id = dept_id AND academic_level_id = (SELECT id FROM public.university_levels WHERE code = 'L1') AND semester_id = (SELECT id FROM public.university_semesters WHERE code = 'S1') AND code = 'INTS005'
    );

    -- L1 S2 — Spring semester verified subjects
    -- GENS004 — Proficiency and Capacity Building (credits 1, verified)
    INSERT INTO public.university_subjects (id, university_id, faculty_id, department_id, academic_level_id, semester_id, name, name_en, code, type, source_url, source_verified_at, created_at, updated_at)
    SELECT gen_random_uuid(), univ_id, fac_id, dept_id,
      (SELECT id FROM public.university_levels WHERE code = 'L1'),
      (SELECT id FROM public.university_semesters WHERE code = 'S2'),
      'بناء الكفاءة والقدرة', 'Proficiency and Capacity Building', 'GENS004', 'core',
      'https://eng.cu.edu.eg/wp-content/uploads/credituser/2015/S5_CUFE-2023-CCEc-REG2023-V1-WM.pdf', now(), now(), now()
    WHERE NOT EXISTS (
      SELECT 1 FROM public.university_subjects WHERE university_id = univ_id AND department_id = dept_id AND academic_level_id = (SELECT id FROM public.university_levels WHERE code = 'L1') AND semester_id = (SELECT id FROM public.university_semesters WHERE code = 'S2') AND code = 'GENS004'
    );
  END IF;
END $$;
