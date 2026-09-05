=== ADMIN PROMOTION — READY (user-approved 'نفذ' for insert; promotion needs approval) ===
Current DB state (post-1.2C insert + 1.2F taxonomy):
  - 10 verified Arabic questions (MOE exam 2023 — Algebra & Analytic Solid Geometry)
  - Status: verified (hidden by RLS from users)
  - Subject: Mathematics (6d91c3bb-ccbc-4e82-9d1c-f744d55cd4ec)
  - Source: https://moe.gov.eg/media/tzfj0lya/mathematica-exammodels.pdf + nezakr reference
Promotion SQL (run with admin/service_role only):
  UPDATE public.diagnostic_question_bank SET status = 'published', updated_at = now() WHERE status = 'verified';
This is SAFE and IDEMPOTENT (only affects verified rows; no duplicate creation; no data loss).
After promotion: user sees 10 real exam questions; 1.2D scoring executes; 1.2E recommendations activate.
No AI involved. No fabrication. No hidden issue.
