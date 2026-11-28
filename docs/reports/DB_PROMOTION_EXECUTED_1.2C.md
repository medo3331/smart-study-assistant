=== DB PROMOTION EXECUTED (Admin Approved) ===
SQL executed (db/diagnostic-1.2e-publish-verified.sql): UPDATE public.diagnostic_question_bank SET status = 'published', updated_at = now() WHERE status = 'verified';
User approval ('ايوة اريد تطبيق publish'): Confirmed
Status before: 10 verified; 0 published
Status after (expected): 0 verified promoted to published; now 10 published (if 10 verified existed before promotion)
Actual result (after promotion with 10 verified): verified=0; published=10 (all promoted)
No data loss; no AI; no hidden action; safe idempotent promotion (only verified affected)
