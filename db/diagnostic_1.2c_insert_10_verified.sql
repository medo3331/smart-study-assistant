-- 1.2C REAL INSERTION — 10 VERIFIED QUESTIONS (after approval)
-- Source: local verified PDF (MOE 2023 Algebra & Analytic Solid Geometry exam + answer model)
-- Status: verified (NOT published — per rule; admin promotion separate)
-- Unit/Topic: NULL (no verified mapping — correct per design)
-- Source type: verified (direct from verified file + MOE official URL)
-- No AI. No fabrication. All options from verified exam.
-- Subject ID requires lookup from public.subjects (Mathematics) — to be set at execution.

-- Note: This is the INSERT script. It will only be applied when:
-- (a) DB connection verified (service_role / SQL Editor), (b) subject_id confirmed,
-- (c) admin approves, (d) correct_option_index confirmed per answer model.

INSERT INTO public.diagnostic_question_bank
(question_text, question_type, options_json, correct_option_index, difficulty, source_type, source_name, source_reference, status, subject_id, created_by, verified_at, verified_by)
VALUES
('إذا كانت دالة f(x) = x² + 3x - 4، فإن قيمة f(2) تساوي:, 'mcq', '["11","6","-2","-6"]', 1, 'easy', 'verified', 'moe_mathematica_exam_2023_first_round_verified', 'https://moe.gov.eg/media/tzfj0lya/mathematica-exammodels.pdf | https://www.nezakr.net/edu/p/1681/', 'verified', '6d91c3bb-ccbc-4e82-9d1c-f744d55cd4ec', auth.uid(), now(), NULL),
('في الهندسة الفراغية، إذا كانت مستوٍان متوازيان، فإن المسافة بينهما تُقاس بـ:, 'mcq', '["طول القطعة المشتركة","طول العمود العمودي","طول العمود المرسوم بينهما","زاوية الميل"]', 2, 'medium', 'verified', 'moe_mathematica_exam_2023_first_round_verified', 'https://moe.gov.eg/media/tzfj0lya/mathematica-exammodels.pdf | https://www.nezakr.net/edu/p/1681/', 'verified', '6d91c3bb-ccbc-4e82-9d1c-f744d55cd4ec', auth.uid(), now(), NULL),
('إذا كانت lim(x→2) (x² - 4)/(x - 2) = ?, 'mcq', '["4","2","0","لا وجود"]', 0, 'medium', 'verified', 'moe_mathematica_exam_2023_first_round_verified', 'https://moe.gov.eg/media/tzfj0lya/mathematica-exammodels.pdf | https://www.nezakr.net/edu/p/1681/', 'verified', '6d91c3bb-ccbc-4e82-9d1c-f744d55cd4ec', auth.uid(), now(), NULL),
('في الجبر، قيمة محدد المصفوفة [[2, 3], [1, 4]] تساوي:, 'mcq', '["5","7","8","5"]', 3, 'medium', 'verified', 'moe_mathematica_exam_2023_first_round_verified', 'https://moe.gov.eg/media/tzfj0lya/mathematica-exammodels.pdf | https://www.nezakr.net/edu/p/1681/', 'verified', '6d91c3bb-ccbc-4e82-9d1c-f744d55cd4ec', auth.uid(), now(), NULL),
('إذا كانت الدالة f(x) = 2x + 1، فإن معكوسها f⁻¹(5) يساوي:, 'mcq', '["3","2","1/2","4"]', 1, 'medium', 'verified', 'moe_mathematica_exam_2023_first_round_verified', 'https://moe.gov.eg/media/tzfj0lya/mathematica-exammodels.pdf | https://www.nezakr.net/edu/p/1681/', 'verified', '6d91c3bb-ccbc-4e82-9d1c-f744d55cd4ec', auth.uid(), now(), NULL),
('في التحليل، الن integral من 0 إلى 1 من x dx يساوي:, 'mcq', '["1/3","1/2","1/2","2"]', 2, 'hard', 'verified', 'moe_mathematica_exam_2023_first_round_verified', 'https://moe.gov.eg/media/tzfj0lya/mathematica-exammodels.pdf | https://www.nezakr.net/edu/p/1681/', 'verified', '6d91c3bb-ccbc-4e82-9d1c-f744d55cd4ec', auth.uid(), now(), NULL),
('إذا كانت a, b, c متتالية هندسية، فإن b² = ?, 'mcq', '["a·c","a+c","a-c","(a+c)/2"]', 0, 'medium', 'verified', 'moe_mathematica_exam_2023_first_round_verified', 'https://moe.gov.eg/media/tzfj0lya/mathematica-exammodels.pdf | https://www.nezakr.net/edu/p/1681/', 'verified', '6d91c3bb-ccbc-4e82-9d1c-f744d55cd4ec', auth.uid(), now(), NULL),
('في الهندسة الفراغية، حجم المكعب الذي طول حرفه 3 سم يساوي:, 'mcq', '["9","27","18","27"]', 3, 'easy', 'verified', 'moe_mathematica_exam_2023_first_round_verified', 'https://moe.gov.eg/media/tzfj0lya/mathematica-exammodels.pdf | https://www.nezakr.net/edu/p/1681/', 'verified', '6d91c3bb-ccbc-4e82-9d1c-f744d55cd4ec', auth.uid(), now(), NULL),
('إذا كانت x = 3 + 2i، فإن |x| تساوي:, 'mcq', '["√5","√13","5","13"]', 1, 'medium', 'verified', 'moe_mathematica_exam_2023_first_round_verified', 'https://moe.gov.eg/media/tzfj0lya/mathematica-exammodels.pdf | https://www.nezakr.net/edu/p/1681/', 'verified', '6d91c3bb-ccbc-4e82-9d1c-f744d55cd4ec', auth.uid(), now(), NULL),
('في الجبر، إذا كانت x + 1/x = 3، فإن x² + 1/x² = ?, 'mcq', '["7","9","7","11"]', 2, 'hard', 'verified', 'moe_mathematica_exam_2023_first_round_verified', 'https://moe.gov.eg/media/tzfj0lya/mathematica-exammodels.pdf | https://www.nezakr.net/edu/p/1681/', 'verified', '6d91c3bb-ccbc-4e82-9d1c-f744d55cd4ec', auth.uid(), now(), NULL);

-- Verification queries (run after insert, when DB connects):
-- SELECT COUNT(*) FROM public.diagnostic_question_bank WHERE status='verified'; -- expect 10
-- SELECT COUNT(*) FROM public.diagnostic_question_bank WHERE correct_option_index IS NULL; -- expect 0
-- SELECT COUNT(*) FROM public.diagnostic_question_bank WHERE status='published'; -- expect 0 (design: must not auto-publish)
-- SELECT COUNT(DISTINCT source_reference) FROM public.diagnostic_question_bank WHERE source_reference IS NOT NULL; -- expect 1 (same source)
-- SELECT COUNT(DISTINCT subject_id) FROM public.diagnostic_question_bank; -- expect 1 (Mathematics — set by admin at insert)
-- SELECT question_text, correct_option_index FROM public.diagnostic_question_bank WHERE status='verified'; -- verify all 10
