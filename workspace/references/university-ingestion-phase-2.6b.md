# University Data Ingestion — Phase 2.6B Audit Pattern (verified official source, SQL ready for admin, PASS WITH MISSING DATA)
Source session: smart-study-assistant 2026-09-05 Phase 2.6B (Cairo University Computer Engineering — CCEc REG 2023; official source fetched from eng.cu.edu.eg)

When user demands verified university data ingestion with official CU curriculum (verified subjects, real DB INSERT, idempotency, RLS, source URLs, no Course Hero as official):

Rules (applied this session — embed for future ingestion tasks):
- Primary verified source required: official CU domain (eng.cu.edu.eg / chreg.eng.cu.edu.eg / cmp.eng.cu.edu.eg). Example: https://eng.cu.edu.eg/wp-content/uploads/credituser/2015/S5_CUFE-2023-CCEc-REG2023-V1-WM.pdf (CCEc COURSE MAP 2023, REG 2023, 155 Cr., 8 semesters — official CU Faculty of Engineering).
- Before any INSERT claim: query live DB via real HTTP (REST anon SELECT). Capture exact row count (before + after). If DB access blocked (missing service_role key, 401 RLS violation), report BLOCKED honestly with exact error message/code — never fabricate PASS or invent rows.
- RLS verification: SELECT via anon key returns 200; INSERT via anon key returns 401 with message `new row violates row-level security policy`. Confirm this before claiming insertion success.
- Idempotency: SQL must use `INSERT ... WHERE NOT EXISTS`; rerun ingestion must not increase row count; confirm unique constraint on `university_subjects` (university_id, department_id, academic_level_id, semester_id, code) is present and active.
- Source metadata: every inserted row must have `source_url` pointing to the official verified URL (`https://eng.cu.edu.eg/wp-content/uploads/credituser/2015/S5_CUFE-2023-CCEc-REG2023-V1-WM.pdf` for CCEc subjects). Save source artifacts (PDF, extracted text) to workspace/.
- Existing verified subjects (CS505 / CS301 / CS220) must remain untouched — no code/name/source modifications without verified proof.
- Don't invent course codes, names, or credits — extract from the official PDF text or report MISSING DATA for unmapped levels/semesters. The PDF clearly lists codes (CHES001, GENS001, PHYS002, PHYS001, EMCS001, INTS005, GENS004, MTHS002, MTHS003, MTHS004, CMPS101, CMPS102, CMPS103, EECS102, etc.) with names and credits; only insert those whose code+name+semester mapping is unambiguously verified by the PDF layout.
- Don't use Course Hero as official source — it may be cited as secondary_verified only, never as sole verification.
- Build PASS (`npm run build`) and TypeScript PASS (`npx tsc --noEmit`) are required gates — fix pre-existing build errors (e.g., add `"use client"` directive to Server Component pages using `useRouter`/`useState`) before claiming PASS.

DB verification performed (real output — verified in session):
- `university_subjects` count BEFORE = 3 (CS505 / CS301 / CS220)
- SELECT anon REST = 200, 3 rows returned
- INSERT anon REST = 401 RLS violation (`new row violates row-level security policy for table "university_subjects"`)
- `.env.local`: no `SUPABASE_SERVICE_ROLE_KEY` (DB server-side mutation BLOCKED for agent; SQL file `workspace/PHASE_2_6B_INSERT_SQL.md` ready for admin SQL Editor execution)
- Verified PDF saved: `workspace/CU_CCEc_REG2023.pdf` (641073 bytes, fetched from official CU URL)
- Verified text extracted: `workspace/CU_CCEc_REG2023_text.txt` (3853 chars, confirms course codes/names/credits/semester layout)
- Idempotency: rerun SQL (`WHERE NOT EXISTS`) must return same DB count; verified by constraint presence.

Pitfalls from this session (encode for future ingestion):
- Build FAIL pre-existing (`app/university/page.tsx` and `app/university/[subjectId]/page.tsx` using `useRouter`/`useState` without `"use client"`) must be fixed (add directive) before any PASS claim — even when error is unrelated to ingestion.
- When official PDF (CUFE-CCE-EN.pdf flyer) confirms program structure but doesn't list exact Level-1 Semester-1 course codes, do NOT fabricate codes — report MISSING DATA. When official REG 2023 PDF (S5_CUFE-2023-CCEc-REG2023-V1-WM.pdf) provides exact codes/names, use ONLY those verified codes.
- Don't say PASS when DB insertion is blocked — say PASS WITH MISSING DATA (build/TS verified; source verified; insertion SQL ready for admin; DB shows previous count unchanged until admin executes SQL).
- Don't invent university subjects when verified official course catalog (PDF) is available but not yet inserted — prepare verified SQL file and report clearly.

Verified course codes extracted from official CU CCEc REG 2023 PDF (verified, NOT fabricated):
- L1 S1 (Fall, SEMESTER 1-2 FALL): CHES001 (Chemistry for Engineers, 2 cr), GENS001 (Critical and Creative Thinking, 2 cr), PHYS002 (Electricity and Magnetism, 2 cr), PHYS001 (Mechanical Properties of Matter and Thermodynamics, 3 cr), EMCS001 (Engineering Mechanics - Statics, 3 cr), INTS005 (Information Technology, 3 cr)
- L1 S2 (Spring, SEMESTER 1-2 SPRING): GENS004 (Proficiency and Capacity Building, 1 cr) — additional S2 subjects exist in PDF layout (e.g., MTHS002, CMPS102, CMPS103) but require full layout verification before insertion; SQL file can be extended by user/admin with verified mappings.
- Higher levels (L2/L3/L4) and additional semesters (S2 for L2/L3/L4): codes verified in PDF but full verified insertion requires complete mapping confirmation — reported as MISSING DATA for unverified mappings, not fabricated.

Status: PASS WITH MISSING DATA (official verified source fetched and parsed — CU CCEc REG 2023 PDF `S5_CUFE-2023-CCEc-REG2023-V1-WM.pdf`; verified SQL file `PHASE_2_6B_INSERT_SQL.md` created with idempotent official-source-only inserts; build/TS PASS; `"use client"` directive fix applied to university pages; DB insertion not executed by agent due to RLS/anon INSERT block; user/admin must execute SQL in Supabase SQL Editor using service_role/admin to complete insertion; then rerun live REST verification for full PASS).
Next: user/admin executes workspace/PHASE_2_6B_INSERT_SQL.md in Supabase SQL Editor → live REST verification shows new verified rows (expected 3 existing + new verified L1 subjects from official PDF) → confirm 0 duplicates → confirm idempotency rerun = same count → confirm `/university` displays new verified subjects → full PASS.
Build fix lesson embedded: add `"use client"` directive to any Next.js 16 App Router page that imports `useRouter`/`useState` (pre-existing build error unrelated to ingestion must be fixed before PASS claim).

Refs within skill: references/university-ingestion-phase-2.6.md; references/university-ingestion-phase-2.6b.md; workspace/references/university-ingestion-phase-2.6.md; workspace/references/university-ingestion-phase-2.6b.md
Refs session artifacts: workspace/verified-ingestion-university-reference.md (audit rules + data integrity); workspace/references/university-ingestion-phase-2.6.md (Phase 2.6 audit pattern); workspace/references/university-ingestion-phase-2.6b.md (this reference); workspace/CU_CCEc_REG2023.pdf; workspace/CU_CCEc_REG2023_text.txt; workspace/PHASE_2_6B_INSERT_SQL.md; workspace/PHASE_2_6B_FINAL_REPORT.md; workspace/PHASE_2_6_POST_INSERT_VERIFICATION.md; db/phase-2.2-university-academic-subjects.sql (schema + UNIQUE constraint); scripts/ingest-source-university.py
