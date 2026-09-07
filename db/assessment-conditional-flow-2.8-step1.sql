-- Step 1 — Conditional Assessment Flow: taxonomy extension + full curriculum seed
-- Branch: assessment-conditional-flow
-- Decisions (user-approved 2026-09-07):
--   1. Reuse existing curricula + subjects (no new subject table)
--   2. Flat profile columns (already exist — no ALTER on profiles needed)
--   3. Full Baccalaureate detail now (no deferral)
--   4. Admin edit via Supabase SQL Editor (no admin UI)
--
-- ⚠️ SUBJECT DATA STATUS: DRAFT DEFAULTS — NOT VERIFIED
-- The subject lists below are reasonable structural defaults based on the
-- long-standing Egyptian MOE core-subject pattern (Arabic / English / Math /
-- Religion + stage-specific sciences/humanities). The curriculum has changed
-- multiple times recently (most recently for the 2025-2026 first-year Bac
-- cohort). EVERY subject row seeded here MUST be verified against the current
-- Ministry of Education announcement (studentbooks.moe.gov.eg) before going
-- live. Admin updates via Supabase SQL Editor: INSERT/UPDATE on
-- public.subjects keyed by (curriculum_id, code). No code deployment needed.
--
-- Idempotent (INSERT ... WHERE NOT EXISTS); RLS-safe (no policy changes);
-- no DROP TABLE / no DELETE. Safe to rerun.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1) Expand education_tracks name CHECK to cover Secondary tracks + Bac tracks
--    Existing CHECK only allows 4 Bac names; Secondary شعبة rows would violate
--    it. Drop the auto-named constraint if present, re-add expanded set.
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'education_tracks_name_check'
      AND conrelid = 'public.education_tracks'::regclass
  ) THEN
    ALTER TABLE public.education_tracks DROP CONSTRAINT education_tracks_name_check;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'education_tracks_name_check'
      AND conrelid = 'public.education_tracks'::regclass
  ) THEN
    ALTER TABLE public.education_tracks ADD CONSTRAINT education_tracks_name_check
      CHECK (name IN (
        -- Baccalaureate مسارات (existing)
        'Medicine & Life Sciences',
        'Engineering & Computer Science',
        'Business',
        'Humanities / Arts',
        -- Secondary شعب (new — ثانوي عام صفي 2 و 3)
        'Science (علوم)',
        'Math (رياضة)',
        'Literary (أدبي)'
      ));
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2) Seed UNIVERSITY stage (CHECK already allows 'University'; row was missing)
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO public.education_stages (id, name, code, order_index, created_at, updated_at)
SELECT gen_random_uuid(), 'University', 'UNIVERSITY', 5, now(), now()
WHERE NOT EXISTS (SELECT 1 FROM public.education_stages WHERE code = 'UNIVERSITY');

-- NOTE: University branch reuses the existing university_* taxonomy
-- (universities / university_faculties / university_departments /
-- university_levels / university_semesters from phase-2.1) + free-text
-- fallback in the UI. No education_grades rows for UNIVERSITY are seeded
-- on purpose — duplicating الفرقة into two taxonomies would desync.
-- profiles columns university_id/faculty_id/department_id/academic_level_id/
-- semester_id already exist (phase-2.1) and stay the flat storage for this
-- branch. Grad/freelancer branch stores profiles.field (already exists).

-- ─────────────────────────────────────────────────────────────────────────────
-- 3) Secondary tracks (شعبة) — stage-level rows, grade_id NULL
--    App logic restricts them to grades 2/3; DB keeps them stage-wide so a
--    future grade-restriction change is a UI edit, not a migration.
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO public.education_tracks (id, stage_id, grade_id, name, code, created_at, updated_at)
SELECT gen_random_uuid(), s.id, NULL, 'Science (علوم)', 'SEC_SCI', now(), now()
FROM public.education_stages s WHERE s.code = 'SECONDARY'
AND NOT EXISTS (SELECT 1 FROM public.education_tracks WHERE code = 'SEC_SCI');

INSERT INTO public.education_tracks (id, stage_id, grade_id, name, code, created_at, updated_at)
SELECT gen_random_uuid(), s.id, NULL, 'Math (رياضة)', 'SEC_MATH', now(), now()
FROM public.education_stages s WHERE s.code = 'SECONDARY'
AND NOT EXISTS (SELECT 1 FROM public.education_tracks WHERE code = 'SEC_MATH');

INSERT INTO public.education_tracks (id, stage_id, grade_id, name, code, created_at, updated_at)
SELECT gen_random_uuid(), s.id, NULL, 'Literary (أدبي)', 'SEC_LIT', now(), now()
FROM public.education_stages s WHERE s.code = 'SECONDARY'
AND NOT EXISTS (SELECT 1 FROM public.education_tracks WHERE code = 'SEC_LIT');

-- ─────────────────────────────────────────────────────────────────────────────
-- 4) Baccalaureate tracks for year 2 (existing 4 are linked to BACC_3 only)
--    Year 1 has no track (common year). Year 2/3 share the same 4 مسارات.
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO public.education_tracks (id, stage_id, grade_id, name, code, created_at, updated_at)
SELECT gen_random_uuid(), s.id, g.id, 'Medicine & Life Sciences', 'MED_Y2', now(), now()
FROM public.education_stages s
JOIN public.education_grades g ON g.stage_id = s.id
WHERE s.code = 'BACCALAUREATE' AND g.code = 'BACC_2'
AND NOT EXISTS (SELECT 1 FROM public.education_tracks WHERE code = 'MED_Y2');

INSERT INTO public.education_tracks (id, stage_id, grade_id, name, code, created_at, updated_at)
SELECT gen_random_uuid(), s.id, g.id, 'Engineering & Computer Science', 'ENG_Y2', now(), now()
FROM public.education_stages s
JOIN public.education_grades g ON g.stage_id = s.id
WHERE s.code = 'BACCALAUREATE' AND g.code = 'BACC_2'
AND NOT EXISTS (SELECT 1 FROM public.education_tracks WHERE code = 'ENG_Y2');

INSERT INTO public.education_tracks (id, stage_id, grade_id, name, code, created_at, updated_at)
SELECT gen_random_uuid(), s.id, g.id, 'Business', 'BUS_Y2', now(), now()
FROM public.education_stages s
JOIN public.education_grades g ON g.stage_id = s.id
WHERE s.code = 'BACCALAUREATE' AND g.code = 'BACC_2'
AND NOT EXISTS (SELECT 1 FROM public.education_tracks WHERE code = 'BUS_Y2');

INSERT INTO public.education_tracks (id, stage_id, grade_id, name, code, created_at, updated_at)
SELECT gen_random_uuid(), s.id, g.id, 'Humanities / Arts', 'HUM_Y2', now(), now()
FROM public.education_stages s
JOIN public.education_grades g ON g.stage_id = s.id
WHERE s.code = 'BACCALAUREATE' AND g.code = 'BACC_2'
AND NOT EXISTS (SELECT 1 FROM public.education_tracks WHERE code = 'HUM_Y2');

-- ─────────────────────────────────────────────────────────────────────────────
-- 5) Curricula rows for every stage/grade(/track) combo missing so far
--    Structural rows only (no subject claims) — safe without MOE verification.
--    Country: Egypt (existing country_id used by 1.5B mapping).
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  c_egypt UUID := '65157053-fc04-435f-bd0e-ec10ce97d3e3';
  r RECORD;
BEGIN
  -- 5a) One curriculum per (stage, grade) without track (covers primary,
  --     prep, sec-1, bacc-1, and base rows for tracked grades)
  FOR r IN
    SELECT st.id AS stage_id, st.code AS stage_code,
           g.id AS grade_id, g.code AS grade_code
    FROM public.education_stages st
    JOIN public.education_grades g ON g.stage_id = st.id
    WHERE st.code IN ('PRIMARY','PREPARATORY','SECONDARY','BACCALAUREATE')
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM public.curricula c
      WHERE c.stage_id = r.stage_id AND c.grade_id = r.grade_id AND c.track_id IS NULL
    ) THEN
      INSERT INTO public.curricula (id, country_id, name, code, stage_id, grade_id, track_id, created_at, updated_at)
      VALUES (gen_random_uuid(), c_egypt,
              r.stage_code || ' ' || r.grade_code || ' — 2025-2026',
              r.stage_code || '_' || r.grade_code || '_2626',
              r.stage_id, r.grade_id, NULL, now(), now());
    END IF;
  END LOOP;

  -- 5b) One curriculum per (secondary grade 2/3 × شعبة)
  FOR r IN
    SELECT st.id AS stage_id, g.id AS grade_id, g.code AS grade_code,
           t.id AS track_id, t.code AS track_code
    FROM public.education_stages st
    JOIN public.education_grades g ON g.stage_id = st.id
    CROSS JOIN public.education_tracks t
    WHERE st.code = 'SECONDARY'
      AND g.code IN ('SEC_GEN_2','SEC_GEN_3')
      AND t.code IN ('SEC_SCI','SEC_MATH','SEC_LIT')
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM public.curricula c
      WHERE c.stage_id = r.stage_id AND c.grade_id = r.grade_id AND c.track_id = r.track_id
    ) THEN
      INSERT INTO public.curricula (id, country_id, name, code, stage_id, grade_id, track_id, created_at, updated_at)
      VALUES (gen_random_uuid(), c_egypt,
              'SECONDARY ' || r.grade_code || ' ' || r.track_code || ' — 2025-2026',
              'SEC_' || r.grade_code || '_' || r.track_code || '_2626',
              r.stage_id, r.grade_id, r.track_id, now(), now());
    END IF;
  END LOOP;

  -- 5c) One curriculum per (bacc year 2/3 × مسار)
  FOR r IN
    SELECT st.id AS stage_id, g.id AS grade_id, g.code AS grade_code,
           t.id AS track_id, t.code AS track_code
    FROM public.education_stages st
    JOIN public.education_grades g ON g.stage_id = st.id
    JOIN public.education_tracks t ON t.stage_id = st.id
    WHERE st.code = 'BACCALAUREATE'
      AND g.code IN ('BACC_2','BACC_3')
      AND (
        (g.code = 'BACC_3' AND t.code IN ('MED','ENG','BUS','HUM'))
        OR (g.code = 'BACC_2' AND t.code IN ('MED_Y2','ENG_Y2','BUS_Y2','HUM_Y2'))
      )
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM public.curricula c
      WHERE c.stage_id = r.stage_id AND c.grade_id = r.grade_id AND c.track_id = r.track_id
    ) THEN
      INSERT INTO public.curricula (id, country_id, name, code, stage_id, grade_id, track_id, created_at, updated_at)
      VALUES (gen_random_uuid(), c_egypt,
              'BACCALAUREATE ' || r.grade_code || ' ' || r.track_code || ' — 2025-2026',
              'BACC_' || r.grade_code || '_' || r.track_code || '_2626',
              r.stage_id, r.grade_id, r.track_id, now(), now());
    END IF;
  END LOOP;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6) DRAFT DEFAULT subjects per curriculum (⚠️ NOT VERIFIED — see header)
--    Core pattern shared across grades; tracked curricula get track-specific
--    additions. Every row is updatable via SQL Editor without redeploy:
--      UPDATE public.subjects SET name = '...' WHERE code = '...';
--    Codes are namespaced per curriculum to allow per-year divergence.
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  c RECORD;
  subj TEXT;
  core_subjects TEXT[] := ARRAY['اللغة العربية','اللغة الإنجليزية','الرياضيات','التربية الدينية'];
  sci_extra   TEXT[] := ARRAY['الفيزياء','الكيمياء','الأحياء'];
  math_extra  TEXT[] := ARRAY['الفيزياء','الكيمياء','رياضيات متقدمة'];
  lit_extra   TEXT[] := ARRAY['التاريخ','الجغرافيا','الفلسفة والمنطق'];
  med_extra   TEXT[] := ARRAY['الأحياء','الكيمياء'];
  eng_extra   TEXT[] := ARRAY['الرياضيات المتقدمة','الفيزياء','علوم الحاسب'];
  bus_extra   TEXT[] := ARRAY['إدارة الأعمال','الاقتصاد','المحاسبة'];
  hum_extra   TEXT[] := ARRAY['التاريخ','الفلسفة','الفنون'];
  list TEXT[];
BEGIN
  FOR c IN SELECT id, code FROM public.curricula WHERE code LIKE '%_2626' LOOP
    -- pick subject list by curriculum code
    IF c.code LIKE '%SEC_SCI%' THEN
      list := core_subjects || sci_extra;
    ELSIF c.code LIKE '%SEC_MATH%' THEN
      list := core_subjects || math_extra;
    ELSIF c.code LIKE '%SEC_LIT%' THEN
      list := core_subjects || lit_extra;
    ELSIF c.code LIKE '%MED%' THEN
      list := core_subjects || med_extra;
    ELSIF c.code LIKE '%ENG%' THEN
      list := core_subjects || eng_extra;
    ELSIF c.code LIKE '%BUS%' THEN
      list := core_subjects || bus_extra;
    ELSIF c.code LIKE '%HUM%' THEN
      list := core_subjects || hum_extra;
    ELSIF c.code LIKE 'PRIM%' THEN
      list := core_subjects || ARRAY['العلوم','الدراسات الاجتماعية','المهارات المهنية'];
    ELSIF c.code LIKE 'PREP%' THEN
      list := core_subjects || ARRAY['العلوم','الدراسات الاجتماعية'];
    ELSE
      -- SEC_GEN_1 / BACC_1 / base rows: common-year core + general science
      list := core_subjects || ARRAY['العلوم','الدراسات الاجتماعية'];
    END IF;

    FOREACH subj IN ARRAY list LOOP
      IF NOT EXISTS (
        SELECT 1 FROM public.subjects s
        WHERE s.curriculum_id = c.id AND s.name = subj
      ) THEN
        INSERT INTO public.subjects (id, curriculum_id, name, code, created_at, updated_at)
        VALUES (gen_random_uuid(), c.id, subj, c.code || '_' || subj, now(), now());
      END IF;
    END LOOP;
  END LOOP;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 7) Flat profile storage map (no schema change — documents Step-1 contract
--    for the UI + AI/video consumers). All columns already exist:
--      persona               → role: student | grad | freelancer
--      education_stage_id    → stage (PRIMARY/PREPARATORY/SECONDARY/
--                             BACCALAUREATE/UNIVERSITY; null for grad/freelancer
--                             and for university-branch students*)
--      education_grade_id    → grade/year (null for grad/freelancer + university)
--      education_track_id    → track/شعبة/مسار (null unless sec-2/3 or bacc-2/3)
--      university_id / faculty_id / department_id /
--        academic_level_id / semester_id → university branch only
--      field                 → grad/freelancer industry (already in profiles)
--      subject               → resolved subject list head / active subject
--    *University-branch students store education_* as NULL to avoid
--     cross-contamination (existing 2.6B convention, kept).
-- ─────────────────────────────────────────────────────────────────────────────
COMMENT ON TABLE public.education_tracks IS 'Tracks incl. Secondary شعبة (SEC_SCI/MATH/LIT) + Bac مسارات (MED/ENG/BUS/HUM × Y2/Y3). Step-1 conditional flow 2026-09. DRAFT subjects — verify vs MOE before live.';
