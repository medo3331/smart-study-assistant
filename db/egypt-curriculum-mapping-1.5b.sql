-- Phase 1.5B — Verified Egyptian Curriculum Mapping 2025-2026 (MOE official sources)
-- Source citations: studentbooks.moe.gov.eg library; MOE PDF StudentBook2025_2026 intro; egypttelegraph/exam-eg verified 2025 articles
-- NO INVENTED SUBJECTS — only verified from official Egyptian Ministry of Education publications
-- Idempotent (INSERT ... WHERE NOT EXISTS); RLS-safe; no DROP/DELETE
-- Schema: existing curricula (stage_id/grade_id) + subjects (curriculum_id)

DO $$
DECLARE
  stage_primary UUID := (SELECT id FROM public.education_stages WHERE code = 'PRIMARY');
  stage_prep UUID := (SELECT id FROM public.education_stages WHERE code = 'PREPARATORY');
  stage_sec UUID := (SELECT id FROM public.education_stages WHERE code = 'SECONDARY');
  stage_bacc UUID := (SELECT id FROM public.education_stages WHERE code = 'BACCALAUREATE');
BEGIN
  INSERT INTO public.curricula (id, country_id, name, code, stage_id, grade_id, created_at, updated_at)
  SELECT gen_random_uuid(), '65157053-fc04-435f-bd0e-ec10ce97d3e3', 'Primary Grade 1 — 2025-2026', 'PRIM_G1_2626', stage_primary, (SELECT id FROM public.education_grades WHERE stage_id = stage_primary AND code = 'P1'), now(), now()
  WHERE NOT EXISTS (SELECT 1 FROM public.curricula WHERE stage_id = stage_primary AND grade_id = (SELECT id FROM public.education_grades WHERE stage_id = stage_primary AND code = 'P1'));

  INSERT INTO public.curricula (id, country_id, name, code, stage_id, grade_id, created_at, updated_at)
  SELECT gen_random_uuid(), '65157053-fc04-435f-bd0e-ec10ce97d3e3', 'Primary Grade 2 — 2025-2026', 'PRIM_G2_2626', stage_primary, (SELECT id FROM public.education_grades WHERE stage_id = stage_primary AND code = 'P2'), now(), now()
  WHERE NOT EXISTS (SELECT 1 FROM public.curricula WHERE stage_id = stage_primary AND grade_id = (SELECT id FROM public.education_grades WHERE stage_id = stage_primary AND code = 'P2'));

  INSERT INTO public.curricula (id, country_id, name, code, stage_id, grade_id, created_at, updated_at)
  SELECT gen_random_uuid(), '65157053-fc04-435f-bd0e-ec10ce97d3e3', 'Primary Grade 3 — 2025-2026', 'PRIM_G3_2626', stage_primary, (SELECT id FROM public.education_grades WHERE stage_id = stage_primary AND code = 'P3'), now(), now()
  WHERE NOT EXISTS (SELECT 1 FROM public.curricula WHERE stage_id = stage_primary AND grade_id = (SELECT id FROM public.education_grades WHERE stage_id = stage_primary AND code = 'P3'));

  INSERT INTO public.curricula (id, country_id, name, code, stage_id, grade_id, created_at, updated_at)
  SELECT gen_random_uuid(), '65157053-fc04-435f-bd0e-ec10ce97d3e3', 'Primary Grade 4 — 2025-2026', 'PRIM_G4_2626', stage_primary, (SELECT id FROM public.education_grades WHERE stage_id = stage_primary AND code = 'P4'), now(), now()
  WHERE NOT EXISTS (SELECT 1 FROM public.curricula WHERE stage_id = stage_primary AND grade_id = (SELECT id FROM public.education_grades WHERE stage_id = stage_primary AND code = 'P4'));

  INSERT INTO public.curricula (id, country_id, name, code, stage_id, grade_id, created_at, updated_at)
  SELECT gen_random_uuid(), '65157053-fc04-435f-bd0e-ec10ce97d3e3', 'Primary Grade 5 — 2025-2026', 'PRIM_G5_2626', stage_primary, (SELECT id FROM public.education_grades WHERE stage_id = stage_primary AND code = 'P5'), now(), now()
  WHERE NOT EXISTS (SELECT 1 FROM public.curricula WHERE stage_id = stage_primary AND grade_id = (SELECT id FROM public.education_grades WHERE stage_id = stage_primary AND code = 'P5'));

  INSERT INTO public.curricula (id, country_id, name, code, stage_id, grade_id, created_at, updated_at)
  SELECT gen_random_uuid(), '65157053-fc04-435f-bd0e-ec10ce97d3e3', 'Primary Grade 6 — 2025-2026', 'PRIM_G6_2626', stage_primary, (SELECT id FROM public.education_grades WHERE stage_id = stage_primary AND code = 'P6'), now(), now()
  WHERE NOT EXISTS (SELECT 1 FROM public.curricula WHERE stage_id = stage_primary AND grade_id = (SELECT id FROM public.education_grades WHERE stage_id = stage_primary AND code = 'P6'));

  INSERT INTO public.curricula (id, country_id, name, code, stage_id, grade_id, created_at, updated_at)
  SELECT gen_random_uuid(), '65157053-fc04-435f-bd0e-ec10ce97d3e3', 'Preparatory Grade 1 — 2025-2026', 'PREP_G1_2626', stage_prep, (SELECT id FROM public.education_grades WHERE stage_id = stage_prep AND code = 'PREP1'), now(), now()
  WHERE NOT EXISTS (SELECT 1 FROM public.curricula WHERE stage_id = stage_prep AND grade_id = (SELECT id FROM public.education_grades WHERE stage_id = stage_prep AND code = 'PREP1'));

  INSERT INTO public.curricula (id, country_id, name, code, stage_id, grade_id, created_at, updated_at)
  SELECT gen_random_uuid(), '65157053-fc04-435f-bd0e-ec10ce97d3e3', 'Preparatory Grade 2 — 2025-2026', 'PREP_G2_2626', stage_prep, (SELECT id FROM public.education_grades WHERE stage_id = stage_prep AND code = 'PREP2'), now(), now()
  WHERE NOT EXISTS (SELECT 1 FROM public.curricula WHERE stage_id = stage_prep AND grade_id = (SELECT id FROM public.education_grades WHERE stage_id = stage_prep AND code = 'PREP2'));

  INSERT INTO public.curricula (id, country_id, name, code, stage_id, grade_id, created_at, updated_at)
  SELECT gen_random_uuid(), '65157053-fc04-435f-bd0e-ec10ce97d3e3', 'Preparatory Grade 3 — 2025-2026', 'PREP_G3_2626', stage_prep, (SELECT id FROM public.education_grades WHERE stage_id = stage_prep AND code = 'PREP3'), now(), now()
  WHERE NOT EXISTS (SELECT 1 FROM public.curricula WHERE stage_id = stage_prep AND grade_id = (SELECT id FROM public.education_grades WHERE stage_id = stage_prep AND code = 'PREP3'));

  INSERT INTO public.curricula (id, country_id, name, code, stage_id, grade_id, created_at, updated_at)
  SELECT gen_random_uuid(), '65157053-fc04-435f-bd0e-ec10ce97d3e3', 'Secondary Grade 1 — 2025-2026', 'SEC_GEN_G1_2626', stage_sec, (SELECT id FROM public.education_grades WHERE stage_id = stage_sec AND code = 'SEC_GEN_1'), now(), now()
  WHERE NOT EXISTS (SELECT 1 FROM public.curricula WHERE stage_id = stage_sec AND grade_id = (SELECT id FROM public.education_grades WHERE stage_id = stage_sec AND code = 'SEC_GEN_1'));

  INSERT INTO public.curricula (id, country_id, name, code, stage_id, grade_id, created_at, updated_at)
  SELECT gen_random_uuid(), '65157053-fc04-435f-bd0e-ec10ce97d3e3', 'Secondary Grade 2 — 2025-2026', 'SEC_GEN_G2_2626', stage_sec, (SELECT id FROM public.education_grades WHERE stage_id = stage_sec AND code = 'SEC_GEN_2'), now(), now()
  WHERE NOT EXISTS (SELECT 1 FROM public.curricula WHERE stage_id = stage_sec AND grade_id = (SELECT id FROM public.education_grades WHERE stage_id = stage_sec AND code = 'SEC_GEN_2'));

  INSERT INTO public.curricula (id, country_id, name, code, stage_id, grade_id, created_at, updated_at)
  SELECT gen_random_uuid(), '65157053-fc04-435f-bd0e-ec10ce97d3e3', 'Secondary Grade 3 — 2025-2026', 'SEC_GEN_G3_2626', stage_sec, (SELECT id FROM public.education_grades WHERE stage_id = stage_sec AND code = 'SEC_GEN_3'), now(), now()
  WHERE NOT EXISTS (SELECT 1 FROM public.curricula WHERE stage_id = stage_sec AND grade_id = (SELECT id FROM public.education_grades WHERE stage_id = stage_sec AND code = 'SEC_GEN_3'));

  INSERT INTO public.curricula (id, country_id, name, code, stage_id, grade_id, created_at, updated_at)
  SELECT gen_random_uuid(), '65157053-fc04-435f-bd0e-ec10ce97d3e3', 'Baccalaureate Grade 1 — 2025-2026', 'BACC_G1_2626', stage_bacc, (SELECT id FROM public.education_grades WHERE stage_id = stage_bacc AND code = 'BACC_1'), now(), now()
  WHERE NOT EXISTS (SELECT 1 FROM public.curricula WHERE stage_id = stage_bacc AND grade_id = (SELECT id FROM public.education_grades WHERE stage_id = stage_bacc AND code = 'BACC_1'));

  INSERT INTO public.curricula (id, country_id, name, code, stage_id, grade_id, created_at, updated_at)
  SELECT gen_random_uuid(), '65157053-fc04-435f-bd0e-ec10ce97d3e3', 'Baccalaureate Grade 2 — 2025-2026', 'BACC_G2_2626', stage_bacc, (SELECT id FROM public.education_grades WHERE stage_id = stage_bacc AND code = 'BACC_2'), now(), now()
  WHERE NOT EXISTS (SELECT 1 FROM public.curricula WHERE stage_id = stage_bacc AND grade_id = (SELECT id FROM public.education_grades WHERE stage_id = stage_bacc AND code = 'BACC_2'));

  INSERT INTO public.curricula (id, country_id, name, code, stage_id, grade_id, created_at, updated_at)
  SELECT gen_random_uuid(), '65157053-fc04-435f-bd0e-ec10ce97d3e3', 'Baccalaureate Grade 3 — 2025-2026', 'BACC_G3_2626', stage_bacc, (SELECT id FROM public.education_grades WHERE stage_id = stage_bacc AND code = 'BACC_3'), now(), now()
  WHERE NOT EXISTS (SELECT 1 FROM public.curricula WHERE stage_id = stage_bacc AND grade_id = (SELECT id FROM public.education_grades WHERE stage_id = stage_bacc AND code = 'BACC_3'));
END $$;

DO $$
DECLARE
  curr_prim4 UUID := (SELECT id FROM public.curricula WHERE code = 'PRIM_G4_2626');
BEGIN
  IF curr_prim4 IS NOT NULL THEN
    INSERT INTO public.subjects (id, curriculum_id, name, code, created_at, updated_at)
    SELECT gen_random_uuid(), curr_prim4, 'اللغة العربية', 'AR_PRIM_G4', now(), now()
    WHERE NOT EXISTS (SELECT 1 FROM public.subjects WHERE curriculum_id = curr_prim4 AND code = 'AR_PRIM_G4');
    INSERT INTO public.subjects (id, curriculum_id, name, code, created_at, updated_at)
    SELECT gen_random_uuid(), curr_prim4, 'اللغة الإنجليزية', 'EN_PRIM_G4', now(), now()
    WHERE NOT EXISTS (SELECT 1 FROM public.subjects WHERE curriculum_id = curr_prim4 AND code = 'EN_PRIM_G4');
    INSERT INTO public.subjects (id, curriculum_id, name, code, created_at, updated_at)
    SELECT gen_random_uuid(), curr_prim4, 'الرياضيات', 'MATH_PRIM_G4', now(), now()
    WHERE NOT EXISTS (SELECT 1 FROM public.subjects WHERE curriculum_id = curr_prim4 AND code = 'MATH_PRIM_G4');
    INSERT INTO public.subjects (id, curriculum_id, name, code, created_at, updated_at)
    SELECT gen_random_uuid(), curr_prim4, 'التربية الدينية', 'REL_PRIM_G4', now(), now()
    WHERE NOT EXISTS (SELECT 1 FROM public.subjects WHERE curriculum_id = curr_prim4 AND code = 'REL_PRIM_G4');
    INSERT INTO public.subjects (id, curriculum_id, name, code, created_at, updated_at)
    SELECT gen_random_uuid(), curr_prim4, 'الدراسات الاجتماعية', 'SS_PRIM_G4', now(), now()
    WHERE NOT EXISTS (SELECT 1 FROM public.subjects WHERE curriculum_id = curr_prim4 AND code = 'SS_PRIM_G4');
    INSERT INTO public.subjects (id, curriculum_id, name, code, created_at, updated_at)
    SELECT gen_random_uuid(), curr_prim4, 'العلوم', 'SCI_PRIM_G4', now(), now()
    WHERE NOT EXISTS (SELECT 1 FROM public.subjects WHERE curriculum_id = curr_prim4 AND code = 'SCI_PRIM_G4');
    INSERT INTO public.subjects (id, curriculum_id, name, code, created_at, updated_at)
    SELECT gen_random_uuid(), curr_prim4, 'المهارات المهنية', 'PROF_PRIM_G4', now(), now()
    WHERE NOT EXISTS (SELECT 1 FROM public.subjects WHERE curriculum_id = curr_prim4 AND code = 'PROF_PRIM_G4');
  END IF;
END $$;

DO $$
DECLARE
  curr_sec1 UUID := (SELECT id FROM public.curricula WHERE code = 'SEC_GEN_G1_2626');
BEGIN
  IF curr_sec1 IS NOT NULL THEN
    INSERT INTO public.subjects (id, curriculum_id, name, code, created_at, updated_at)
    SELECT gen_random_uuid(), curr_sec1, 'اللغة العربية', 'AR_SEC_G1', now(), now()
    WHERE NOT EXISTS (SELECT 1 FROM public.subjects WHERE curriculum_id = curr_sec1 AND code = 'AR_SEC_G1');
    INSERT INTO public.subjects (id, curriculum_id, name, code, created_at, updated_at)
    SELECT gen_random_uuid(), curr_sec1, 'اللغة الإنجليزية', 'EN_SEC_G1', now(), now()
    WHERE NOT EXISTS (SELECT 1 FROM public.subjects WHERE curriculum_id = curr_sec1 AND code = 'EN_SEC_G1');
    INSERT INTO public.subjects (id, curriculum_id, name, code, created_at, updated_at)
    SELECT gen_random_uuid(), curr_sec1, 'الرياضيات', 'MATH_SEC_G1', now(), now()
    WHERE NOT EXISTS (SELECT 1 FROM public.subjects WHERE curriculum_id = curr_sec1 AND code = 'MATH_SEC_G1');
    INSERT INTO public.subjects (id, curriculum_id, name, code, created_at, updated_at)
    SELECT gen_random_uuid(), curr_sec1, 'التربية الدينية', 'REL_SEC_G1', now(), now()
    WHERE NOT EXISTS (SELECT 1 FROM public.subjects WHERE curriculum_id = curr_sec1 AND code = 'REL_SEC_G1');
    INSERT INTO public.subjects (id, curriculum_id, name, code, created_at, updated_at)
    SELECT gen_random_uuid(), curr_sec1, 'الدراسات الاجتماعية', 'SS_SEC_G1', now(), now()
    WHERE NOT EXISTS (SELECT 1 FROM public.subjects WHERE curriculum_id = curr_sec1 AND code = 'SS_SEC_G1');
    INSERT INTO public.subjects (id, curriculum_id, name, code, created_at, updated_at)
    SELECT gen_random_uuid(), curr_sec1, 'العلوم', 'SCI_SEC_G1', now(), now()
    WHERE NOT EXISTS (SELECT 1 FROM public.subjects WHERE curriculum_id = curr_sec1 AND code = 'SCI_SEC_G1');
  END IF;
END $$;

DO $$
DECLARE
  curr_bacc1 UUID := (SELECT id FROM public.curricula WHERE code = 'BACC_G1_2626');
BEGIN
  IF curr_bacc1 IS NOT NULL THEN
    INSERT INTO public.subjects (id, curriculum_id, name, code, created_at, updated_at)
    SELECT gen_random_uuid(), curr_bacc1, 'اللغة العربية', 'AR_BACC_G1', now(), now()
    WHERE NOT EXISTS (SELECT 1 FROM public.subjects WHERE curriculum_id = curr_bacc1 AND code = 'AR_BACC_G1');
    INSERT INTO public.subjects (id, curriculum_id, name, code, created_at, updated_at)
    SELECT gen_random_uuid(), curr_bacc1, 'اللغة الإنجليزية', 'EN_BACC_G1', now(), now()
    WHERE NOT EXISTS (SELECT 1 FROM public.subjects WHERE curriculum_id = curr_bacc1 AND code = 'EN_BACC_G1');
    INSERT INTO public.subjects (id, curriculum_id, name, code, created_at, updated_at)
    SELECT gen_random_uuid(), curr_bacc1, 'الرياضيات', 'MATH_BACC_G1', now(), now()
    WHERE NOT EXISTS (SELECT 1 FROM public.subjects WHERE curriculum_id = curr_bacc1 AND code = 'MATH_BACC_G1');
  END IF;
END $$;
