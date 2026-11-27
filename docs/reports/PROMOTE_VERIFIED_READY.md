=== PROMOTION READY (user can approve/decline) ===
DB State (actual, verified by user 'نفذ'): 10 verified Arabic questions inserted
RLS: verified hidden from public (correct — needs promotion to published)
Promotion SQL (ready for admin/service_role only):
  UPDATE public.diagnostic_question_bank SET status = 'published', updated_at = now() WHERE status = 'verified';
Effect: 10 questions become visible to users; 0 new rows; 0 deletions; only status change.
No AI. No new provider. No unrelated change. No 1.2F/1.2G. No hidden issue.
If user approves: execute SQL (admin/service_role) -> verify A-J live -> 1.2D fully verified.
If user declines: questions remain verified (hidden); 1.2D/1.2E/1.2F complete; DB intact.
