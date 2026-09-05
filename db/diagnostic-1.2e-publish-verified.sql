-- 1.2E — PROMOTION SQL (admin/service_role only): verified -> published
-- After admin verifies content + execution complete, this promotes verified questions
-- No AI. No fabrication. Only verified questions promoted.
UPDATE public.diagnostic_question_bank SET status = 'published', updated_at = now() WHERE status = 'verified';
-- Only after promotion will RLS public_read_published show them to users.
