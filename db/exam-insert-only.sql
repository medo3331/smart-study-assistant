-- EXACT INSERT — run in Supabase SQL Editor (admin/service_role)
-- Taxonomy must exist (verified live: EG/GSEC/MATH/2024-2025)
-- NO taxonomy inserts — only exam
-- No questions/answers/storage/UI/AI/commit
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
where c.code = 'EG' and cu.code = 'GSEC' and s.code = 'MATH' and a.label = '2024-2025';


-- Verification (run after insert):
SELECT COUNT(*) FROM public.past_exams WHERE source_name = 'Ministry of Education — Egypt (MOE)';
SELECT id, title, is_published, exam_file_path, answer_file_path, exam_date, duration_minutes, total_marks, source_name FROM public.past_exams WHERE title LIKE '%Thanaweya Amma%';
SELECT COUNT(*) FROM public.past_exam_questions WHERE exam_id = (SELECT id FROM public.past_exams WHERE title LIKE '%Thanaweya Amma%');
SELECT COUNT(*) FROM public.past_exam_answers WHERE question_id IN (SELECT id FROM public.past_exam_questions WHERE exam_id = (SELECT id FROM public.past_exams WHERE title LIKE '%Thanaweya Amma%'));

-- VERIFICATION (run after insert in Supabase SQL Editor)
SELECT 'exam_count' as check, COUNT(*) FROM public.past_exams WHERE source_name = 'Ministry of Education — Egypt (MOE)';
SELECT 'exam_row' as check, id, title, is_published, exam_file_path, answer_file_path, exam_date, duration_minutes, total_marks FROM public.past_exams WHERE title LIKE '%Thanaweya Amma%';
SELECT 'questions' as check, COUNT(*) FROM public.past_exam_questions WHERE exam_id = (SELECT id FROM public.past_exams WHERE title LIKE '%Thanaweya Amma%');
SELECT 'answers' as check, COUNT(*) FROM public.past_exam_answers WHERE question_id IN (SELECT id FROM public.past_exam_questions WHERE exam_id = (SELECT id FROM public.past_exams WHERE title LIKE '%Thanaweya Amma%'));
SELECT 'taxonomy_link' as check, s.name, a.label FROM public.past_exams p JOIN public.subjects s ON p.subject_id = s.id JOIN public.academic_years a ON p.academic_year_id = a.id WHERE p.title LIKE '%Thanaweya Amma%';
