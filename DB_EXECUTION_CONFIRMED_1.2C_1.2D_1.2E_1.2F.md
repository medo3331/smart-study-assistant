=== ADMIN EXECUTION CONFIRMED ===
Status: 1.2C-1.2D-1.2E SQL executed by admin (service_role)
DB state (expected):
  - 10 verified Arabic MCQ in diagnostic_question_bank
  - status='verified' (correct — must promote to published manually)
  - correct_option_index set (1,2,0,3,1,2,0,3,1,2)
  - source_type='verified'
  - source_reference='https://moe.gov.eg/media/tzfj0lya/mathematica-exammodels.pdf | https://www.nezakr.net/edu/p/1681/'
  - subject_id='6d91c3bb-ccbc-4e82-9d1c-f744d55cd4ec'
  - unit_id=NULL / topic_id=NULL (design — correct until mapping verified)
  
VERIFICATION QUERIES (run now by admin):
SELECT COUNT(*) FROM public.diagnostic_question_bank WHERE status='verified'; -- 10
SELECT COUNT(DISTINCT question_text) FROM public.diagnostic_question_bank; -- 10
SELECT COUNT(*) FROM public.diagnostic_question_bank WHERE status='published'; -- 0 (expected until promotion)
SELECT COUNT(*) FROM public.diagnostic_question_bank WHERE correct_option_index IS NULL; -- 0
SELECT COUNT(*) FROM public.diagnostic_question_bank WHERE subject_id = '6d91c3bb-ccbc-4e82-9d1c-f744d55cd4ec'; -- 10
SELECT * FROM public.diagnostic_sessions WHERE user_id = auth.uid(); -- session (after 1.2D use)

PROMOTE TO PUBLISHED (only if approved — requires admin sign-off):
UPDATE public.diagnostic_question_bank SET status = 'published', updated_at = now() WHERE status = 'verified';
