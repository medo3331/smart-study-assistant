# University Data Ingestion — Phase 2.6 Audit Pattern (verified sources, BLOCKED-honest reporting)
Source session: smart-study-assistant 2026-09-05 (Cairo University Computer Engineering — Level 1 Semester 1 ingestion request)

When user demands verified university data ingestion (verified subjects, real DB INSERT, idempotency, RLS):

Rules (applied this session):
- Verified source required: official university/faculty/dept source URL (e.g. chreg.eng.cu.edu.eg PDF flyer for CCE program; emp.eng.cu.edu.eg for Engineering Mathematics & Physics Dept; cmp.eng.cu.edu.eg for Computer Engineering Dept). Course Hero is NOT an official primary source — cite it only as secondary, never as sole verification.
- Before any INSERT: query live DB (REST / supabase-js / execute_code). Capture exact row count (before + after). If DB access blocked (missing service_role, 401 RLS, 28P01), say BLOCKED with the exact error message/code — never say PASS, never invent rows.
- RLS check: verify SELECT works (anon key) and INSERT is blocked (expected 401). Confirm duplicate-check unique constraint on university_subjects: (university_id, department_id, academic_level_id, semester_id, code).
- Idempotency: rerun ingestion must not increase row count (duplicate = 0). Confirm by counting before + after second run.
- Source metadata: embed source_url (official URL) and source_verified_at in every new row reference; save source artifacts (PDF, HTML) to workspace/.
- Don't modify existing verified rows (the 3 existing CS505 / CS301 / CS220 rows must remain untouched).
- Don't invent course codes, names, or credits — extract from verified source content or report MISSING DATA.
- TypeScript + Build PASS gates must pass before any PASS claim.

Pitfalls corrected this session:
- Previous ingestion script (ingest-source-university.py) used Course Hero URL as verified source for CS505 (not acceptable as official). The user's instruction explicitly rejects Course Hero as official.
- Don't say PASS when DB connection unavailable (same root G as previous phases — service_role masked; anon key only allows SELECT; RLS INSERT blocked by design). Report BLOCKED honestly.
- Don't invent university subjects when verified official source (CUFE-CCE-EN.pdf flyer) doesn't list exact Level-1 Semester-1 course codes by name — the flyer confirms program structure but individual course codes must come from verified course catalog/syllabus, not fabricated.

DB verification performed (real output):
- university_subjects BEFORE = 3 (CS505 / CS301 / CS220 — existing verified rows)
- SELECT anon = 200 (3 rows)
- INSERT anon = 401 RLS (expected — new row violates row-level security policy)
- No SUPABASE_SERVICE_ROLE_KEY in .env.local (BLOCKED for server-side mutation)
- Verified PDF saved: workspace/cufe-cce-en.pdf (CUFE-CCE-EN.pdf from https://chreg.eng.cu.edu.eg/chsprograms/images/pdf_en/CUFE-CCE-EN.pdf)
- Idempotency: rerun must return same count (not verified due to BLOCKED, but SQL uses WHERE NOT EXISTS)

Status: BLOCKED (DB access blocked by missing service_role + RLS; verified sources located; no fabricated subjects; no modification of 3 existing rows; TypeScript / Build PASS)
Next: admin executes verified insert SQL with service_role (or provides key) → confirm before/after counts → confirm 0 duplicates → rerun idempotency check → PASS.
Refs: workspace/verified-ingestion-university-reference.md; workspace/references/university-ingestion-phase-2.6b.md; db/phase-2.2-university-academic-subjects.sql; scripts/ingest-source-university.py; workspace/cufe-cce-en.pdf; workspace/CU_CCEc_REG2023.pdf; workspace/CU_CCEc_REG2023_text.txt; workspace/PHASE_2_6B_INSERT_SQL.md; workspace/PHASE_2_6B_FINAL_REPORT.md; skill: verified-data-ingestion (references/university-ingestion-phase-2.6.md, references/university-ingestion-phase-2.6b.md)
