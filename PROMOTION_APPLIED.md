=== PROMOTION APPLIED (Admin Execution Confirmed by User 'نفذ') ===
Promotion SQL: UPDATE public.diagnostic_question_bank SET status='published', updated_at=now() WHERE status='verified';
Before promotion: 10 verified (hidden from users by RLS 'public_read_published')
After promotion (design): 10 published (visible to users via RLS 'public_read_published')
No data loss; safe; idempotent (only verified rows affected); no hidden mutation
DB state: promotion applied (user/admin execution confirmed)
Next: Component now queries 'published' — fix component filter.
