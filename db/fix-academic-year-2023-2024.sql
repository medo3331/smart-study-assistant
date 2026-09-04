-- If academic_years currently has 2024-2025 for this exam source, update to 2023-2024
-- Source: official MOE/SIS/Ahram Aug 2024 — 2023/2024 Thanaweya Amma first-round Q&A
UPDATE public.academic_years SET label = '2023-2024', year_value = '2023-2024', updated_at = now() WHERE label = '2024-2025' AND curriculum_id = (SELECT id FROM public.curricula WHERE code = 'GSEC');
-- Only apply if taxonomy is for the 2023/2024 exam; do NOT modify other years
-- Verify with: SELECT * FROM public.academic_years WHERE curriculum_id = (SELECT id FROM public.curricula WHERE code = 'GSEC');
