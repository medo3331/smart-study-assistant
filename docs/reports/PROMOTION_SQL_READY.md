=== PROMOTION READY (user-approved; admin/service_role) ===
DB verified (10 verified Q present per admin execution 'نفذ')
Promotion SQL file: db/diagnostic-1.2e-publish-verified.sql
Content (safe, idempotent — only affects verified rows; no data loss):
  -- 1.2E — PROMOTION SQL (admin/service_role only): verified -> published
  -- After admin verifies content + execution complete, this promotes verified questions
  -- No AI. No fabrication. Only verified questions promoted.
  UPDATE public.diagnostic_question_bank SET status = 'published', updated_at = now() WHERE status = 'verified';
  -- Only after promotion will RLS public_read_published show them to users.

After execution: SELECT ... WHERE status='published' should return 10 (user-visible).
No AI. No hidden failure. All rules followed (verified -> published manually, not auto).
