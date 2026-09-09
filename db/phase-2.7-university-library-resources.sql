-- Phase 2.7 — Verified initial resources (REAL ONLY — no fabricated content)
-- Source verification: workspace/CU_CCEc_REG2023.pdf (official CU CCEc REG 2023)
-- Note: This table is initially empty; only verified official/secondary sources
-- should be inserted via admin/service mutation (not user upload in Phase 2.7).
-- NO FAKE RESOURCES ADDED.

DO $$
DECLARE
  subj_cs505 UUID;
  subj_cs301 UUID;
  subj_cs220 UUID;
BEGIN
  -- We leave resources empty for initial build.
  -- Verified official PDF reference (not a per-subject resource yet):
  -- If an admin wants to add a verified reference linking the course map:
  SELECT id INTO subj_cs505 FROM public.university_subjects WHERE code = 'CS505' LIMIT 1;
  SELECT id INTO subj_cs301 FROM public.university_subjects WHERE code = 'CS301' LIMIT 1;
  SELECT id INTO subj_cs220 FROM public.university_subjects WHERE code = 'CS220' LIMIT 1;

  -- Only insert if there is a real verified resource file/reference to point to.
  -- The CU CCEc REG 2023 PDF is a verified official source for the program,
  -- not for individual subjects. We do NOT fabricate subject-level resources.
END $$;
