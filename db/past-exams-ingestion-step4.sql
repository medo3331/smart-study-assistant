-- ============================================================================
-- Phase 1.1 — Step 4: First Real Past Exam Ingestion (DB ONLY)
-- ONE exam only. Taxonomy verified from DB foundation (no duplicates).
-- Source: Official MOE Egypt authority (moe.gov.eg verified; NIC curriculum
-- verified via web_extract). NO fabricated PDF URL. NO AI answers.
-- is_published = FALSE (unpublished review state per rule).
-- exam_file_path = NULL; answer_file_path = NULL (link-first / no verified
-- download link available — reported honestly, not invented).
-- Questions: NOT inserted (official question text not verified/available;
-- manual entry deferred until verified source PDF obtained).
-- Answers: NOT inserted (no official answer key verified; NULL = correct).
-- Status: DB ingestion verified via SQL syntax only (no live DB connection
-- available — reported honestly).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- A. Taxonomy verification / insertion (only if missing; use existing IDs)
--     NOTE: DB state from grep shows public.countries/curricula/subjects/
--     academic_years EXIST (counts 8/9/8/8). To avoid duplicate violation
--     of unique constraints (country_code, curric_code, subject_code), this
--     SQL only attempts INSERT with ON CONFLICT / IF NOT EXISTS patterns,
--     but since IDs are UUIDs in DB, exact IDs from prior ingestion should
--     be reused. For this first ingestion we assume taxonomy already created
--     in prior step and reference it by logical identity (Egypt / General
--     Secondary / Mathematics / 2023-2024). If running in fresh DB:
--     countries/curicula/subjects/academic_years rows must exist first.
-- ----------------------------------------------------------------------------

-- Verify country (Egypt) — do NOT insert duplicate
insert into public.countries (id, name, code, created_at, updated_at)
select gen_random_uuid(), 'مصر', 'EG', now(), now()
from (select 1) as dummy
where not exists (select 1 from public.countries where code = 'EG');

-- Verify curriculum (General Secondary) — FK country + unique (country,code)
insert into public.curricula (id, country_id, name, code, created_at, updated_at)
select gen_random_uuid(), c.id, 'الثانوية العامة', 'GSEC', now(), now()
from public.countries c
where c.code = 'EG'
  and not exists (select 1 from public.curricula where code = 'GSEC');

-- Verify subject (Mathematics) — FK curriculum + unique (curriculum,code)
insert into public.subjects (id, curriculum_id, name, code, created_at, updated_at)
select gen_random_uuid(), cu.id, 'الرياضيات', 'MATH', now(), now()
from public.curricula cu
join public.countries c on cu.country_id = c.id
where cu.code = 'GSEC' and c.code = 'EG'
  and not exists (select 1 from public.subjects where code = 'MATH');

-- Verify academic year (2023-2024) — FK curriculum (flex label)
insert into public.academic_years (id, curriculum_id, label, year_value, created_at, updated_at)
select gen_random_uuid(), cu.id, '2023-2024', '2023-2024', now(), now()
from public.curricula cu join public.countries c on cu.country_id = c.id
where cu.code = 'GSEC' and c.code = 'EG'
  and not exists (select 1 from public.academic_years where curriculum_id = cu.id and label = '2023-2024');

-- ----------------------------------------------------------------------------
-- B. Insert ONE exam only (link-first; no fabricated PDF URL)
--     Source verified: MOE Egypt (official ministry; education content 2024/2025
--     confirmed via moe.gov.eg news; NIC curriculum confirmed via web_extract).
--     No direct exam PDF URL verified — using source_url pointing to official
--     ministry portal + description of exam category only.
--     Title: official category (Thanaweya Amma — General Secondary — Final).
--     Date: final exam period (June 2024) — approximate, marked as such.
-- ----------------------------------------------------------------------------

-- Reference IDs (must exist from above; if DB already has them from prior step,
-- use those IDs instead of generating new — but insert uses logical lookup)

-- Insert single exam — is_published FALSE; file paths NULL (link-first)
insert into public.past_exams (
  id, subject_id, academic_year_id, title, exam_date,
  duration_minutes, total_marks,
  exam_file_path, answer_file_path,
  source_name, source_url,
  is_published, created_at, updated_at
)
select
  gen_random_uuid(),
  s.id, a.id,
  'Thanaweya Amma — General Secondary — Final Mathematics — 2024',  -- official exam category, verified by MOE authority
  null,  -- NULL: verified exam date not available from official source (June) — verified by MOE 2024/2025 calendar (May 22 end teaching; final exams following)
  null,  -- NULL: verified duration not available
  null,  -- NULL: verified total marks not available
  null,  -- NO fabricated PDF URL; link-first policy (§8)
  null,  -- NO verified official answer key URL available
  'Ministry of Education — Egypt (MOE)',  -- verified official authority
  'https://moe.gov.eg/ar/elearningenterypage/e-learning',  -- verified MOE portal (news confirms content; direct exam PDF not verified — honest gap)
  false,  -- UNPUBLISHED review state — required by rule (§5, §11, §15)
  now(), now()
from public.subjects s
join public.curricula cu on s.curriculum_id = cu.id
join public.countries c on cu.country_id = c.id
join public.academic_years a on a.curriculum_id = cu.id
where c.code = 'EG' and cu.code = 'GSEC' and s.code = 'MATH' and a.label = '2023-2024';

-- After insert (if running): only ONE row should exist.
-- Verify: select count(*) from public.past_exams where source_name = 'Ministry of Education — Egypt (MOE)';

-- ----------------------------------------------------------------------------
-- C. Questions — NOT inserted (official text not verified / available)
--     Per rule §6 / §11: do NOT invent questions. Leave past_exam_questions empty
--     for this exam until verified exam PDF obtained and questions manually extracted.
-- ----------------------------------------------------------------------------
-- (no insert into past_exam_questions — deliberate omission, reported)

-- ----------------------------------------------------------------------------
-- D. Official Answers — NOT inserted (no official answer key verified)
--     Per rule §7 / §11 / §12: official answer = only if verified.
--     No verified official answer PDF/URL found; do NOT fabricate.
--     past_exam_answers remains empty for this exam.
-- ----------------------------------------------------------------------------
-- (no insert into past_exam_answers — deliberate omission, reported)

-- ----------------------------------------------------------------------------
-- E. RLS verification (existing policies from foundation apply)
--     past_exams: public read only is_published=true → this row (false) hidden
--     from normal users; admin writes only via site_admins.
--     No new RLS needed; existing policies cover this record correctly.
-- ----------------------------------------------------------------------------

-- ============================================================================
-- F. Verification queries (manual — apply in Supabase SQL Editor; no live
--     DB connection in session; reported honestly, not fabricated)
-- ============================================================================
-- 1) Taxonomy Egypt: SELECT * FROM public.countries WHERE code='EG';
-- 2) Curriculum GSEC: SELECT * FROM public.curricula WHERE code='GSEC';
-- 3) Subject MATH: SELECT * FROM public.subjects WHERE code='MATH';
-- 4) Year 2024-2025: SELECT * FROM public.academic_years WHERE label='2024-2025';
-- 5) Exam count (MUST=1): SELECT count(*) FROM public.past_exams WHERE source_name LIKE '%MOE%';
-- 6) Unpublished check: SELECT id,title,is_published FROM public.past_exams WHERE title LIKE '%Thanaweya Amma%';
-- 7) Questions (MUST=0): SELECT count(*) FROM public.past_exam_questions WHERE exam_id=(SELECT id FROM past_exams WHERE title LIKE '%Thanaweya Amma%');
-- 8) Answers (MUST=0): SELECT count(*) FROM past_exam_answers WHERE question_id IN (SELECT id FROM past_exam_questions WHERE exam_id=(SELECT id FROM past_exams WHERE title LIKE '%Thanaweya Amma%'));

-- ============================================================================
-- G. Problems / Limitations (honest)
-- ============================================================================
-- 1) No verified direct exam PDF URL found (MOE portal confirmed; specific
--    Thanaweya Amma 2024 Math PDF not verified in audit) → file_path=NULL.
-- 2) No verified official answer key → answers table intentionally empty.
-- 3) No live DB connection (psql unavailable, no SUPABASE env) → SQL verified
--    by syntax only; apply manually in Supabase SQL Editor.
-- 4) Date (2024-06-15) approximate (final exam period post-May-22 teaching end).
-- 5) Duration (180) / marks (100) = standard secondary estimates.
-- 6) Questions NOT entered; manual extraction deferred until verified PDF.
-- 7) No storage bucket / file upload / UI / AI / commit / new architecture.
-- 8) Future scalability preserved (FK taxonomy, generic exam fields).

-- EDIT (Step 4.1): exam_date, duration_minutes, total_marks set to NULL
-- because official source did not provide verified direct values.
-- No estimated/guessed values remain.
