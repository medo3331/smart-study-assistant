-- Phase 2.6B — Verified University Curriculum Data (Computer Engineering — Cairo University)
-- Official verified source: https://chreg.eng.cu.edu.eg/chsprograms/images/pdf_en/CUFE-CCE-EN.pdf
-- Source type: official (CU Faculty of Engineering official subdomain chreg.eng.cu.edu.eg)
-- Verified content: CCE Program Flyer (2019) confirms Communication & Computer Engineering program exists at CU Faculty of Engineering, with structured first 3 years and CCE-C computer track.
-- IMPORTANT LIMITATION: This PDF does NOT contain specific first-year (Level 1) course codes/names or semester assignments. Only program-level description.
-- Therefore: NO specific L1/S1 course codes can be verified from this source alone. Any course insertion must rely on additional official verified sources.
-- Existing verified subjects (from Phase 2.2) preserved:
--   CS505 | هيكل البيانات والخوارزميات | Data Structures and Algorithms | L1 S1 | core | source=secondary_verified (Course Hero — NOT official CU)
--   CS301 | هندسة البرمجيات I | Software Engineering I | L1 S2 | core | source=verified_secondary (AUC Catalog)
--   CS220 | تصميم الخوارزميات | Algorithms Design | L2 S1 | core | source=verified_secondary (AUC Catalog)
-- DUPLICATE PROTECTION: UNIQUE (university_id, department_id, academic_level_id, semester_id, code) exists.
-- RLS: SELECT allowed (univ_subj_pub_read); INSERT blocked for anon (univ_subj_user_update USING false).
-- DB ACCESS: SELECT verified via REST anon key; INSERT requires service_role or SQL Editor admin execution.
-- NO NEW SUBJECTS INSERTED BY THIS SQL (only verification comments) — because official PDF does not provide specific L1/S1 codes.
-- If user has verified official course list from CU (e.g., via chreg.eng.cu.edu.eg or std.eng.cu.edu.eg), add those codes here with verified source URLs.

-- Verification query (run manually in SQL Editor):
SELECT
  us.code,
  us.name,
  us.name_en,
  ul.code AS level,
  sem.code AS semester,
  u.code AS university,
  uf.code AS faculty,
  ud.code AS department,
  us.source_url,
  us.type
FROM public.university_subjects us
JOIN public.universities u ON u.id = us.university_id
JOIN public.university_faculties uf ON uf.id = us.faculty_id
JOIN public.university_departments ud ON ud.id = us.department_id
JOIN public.university_levels ul ON ul.id = us.academic_level_id
JOIN public.university_semesters sem ON sem.id = us.semester_id
ORDER BY ul.code, sem.code, us.code;

-- Idempotency check (run manually):
SELECT
  university_id, department_id, academic_level_id, semester_id, code,
  COUNT(*) AS count
FROM public.university_subjects
GROUP BY university_id, department_id, academic_level_id, semester_id, code
HAVING COUNT(*) > 1;

-- Before count:
SELECT COUNT(*) FROM public.university_subjects;
