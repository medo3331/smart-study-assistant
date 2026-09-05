# University Curriculum Audit Pattern — Phase 2.1–2.5 (verified sources, no fabrication)

Source session: smart-study-assistant 2026-09-05 (audit-first, subagent ZCode live DB verification + verified data ingestion)
Purpose: reusable reference for university-level DB audit, verified-source mapping, and PASS WITH MISSING DATA reporting.

## When to apply
When user demands university education mapping: audit DB live, verify official sources, seed verified only, report BLOCKED/PASS WITH MISSING DATA honestly, never fabricate mapping.

## Audit rules (from session)
- Inspect schema: universities / university_faculties / university_departments / university_levels / university_semesters / university_subjects / curricula / subjects / profiles FKs
- Try real DB query (subagent / curl / execute_code to Supabase); capture exact error (28P01 / anon key missing / auth) — NEVER invent PASS
- Read existing seed data (subagent saved JSON: stages_resp.json / grades.json / curricula.json / subjects.json); use verified sources only (MOE official PDF / official portal / Course Hero verified listings — cited in SQL comments)
- Report mapping table: Stage | Grade | Curriculum | Subjects | Status → BLOCKED / MISSING DATA (never PASS if mapping incomplete)
- Localization: DB codes (PRIMARY, PREPARATORY, SECONDARY, BACCALAUREATE) → localized labels via locale (ar/en); no raw English in Arabic UI
- Security: queries filtered by auth.uid (existing RLS); profile FKs refer to user own profile only; no service_role exposure
- Performance: single query chain (profile → curricula by stage/grade → subjects by curriculum_ids) — no N+1; university branch separate (university_subjects by university/faculty/department/level/semester); school and university isolated (no cross-contamination)

## Verified-source citation format (use in SQL)
Comment block in SQL: -- Source verification: <official source> (<date if available>) — verified <stage/grade/subject/code>; no invention
Evidence artifacts: workspace/*.json (DB response) + workspace/*AUDIT_REPORT.md + workspace/*.sql (seed with source citations)

## Data integrity rules applied in session
- No invented subjects (Programming/AI not added to Primary/Preparatory; only verified CS 505/301/220 for Computer Engineering)
- No invented universities/faculties/departments (only verified CAU + ENG faculty + CSED department used for seed)
- No invented grades/levels/semesters (only canonical L1-L4 / S1-S2 from verified university taxonomy)
- Idempotent SQL (CREATE IF NOT EXISTS; INSERT ... WHERE NOT EXISTS; no DROP/DELETE of valid data; RLS policies preserved/added)
- Profile FKs (university/faculty/department/academic_level/semester) nullable — backward compatible; school students unaffected
- GPA calculation pure deterministic (gradePoint mapping A=4.0→F=0, P excluded; calculateGPA operates on verified records only) — no DB call; no AI; no mock data

## Pitfalls from session
- Forgetting `useLanguage()` locale destruct (breaks localization; causes TS error)
- Hardcoding Arabic-only text in new pages (must support English too)
- Inventing mapping when DB empty (must say MISSING DATA, not PASS)
- Over-engineering university page (must be minimal — card grid + empty/fallback states; existing NavRail/Sidebar preserved; no redesign)
- Not adding university branch to getAvailableSubjects (would break university student flow — university query uses university_subjects, separate from curricula/subjects)
- Mixing university and school data (must be isolated branches)
- Not reading profile pre-load (user must see saved university/subject/faculty data on refresh; profile select must include university fields)
- Not adding source_url / source_verified metadata (optional per spec sec 11; session doesn't add metadata columns — reference notes this as potential future improvement without changing schema)

## Evidence format
Live DB results: save JSON (stages/grades/curricula/subjects/university) + PHASE_*_AUDIT_REPORT.md (honest table: Status = BLOCKED / PASS WITH MISSING DATA / PASS for verified rows)
Code: files changed listed; build/TS verified; regression untested (assessment/dashboard preserved — no change made)
DB: no destructive operations; seed only applied with verified sources

Status: PASS WITH MISSING DATA — code verified; DB live blocked (anon key / auth); architecture complete (normalized DB + pure utility + university branch); verified sources cited; no fabrication.
Refs: lib/education/context.ts; lib/education/gpa.ts; db/phase-2.1-*.sql; db/phase-2.4-university-gpa.sql; db/phase-2.2-university-academic-subjects.sql; app/university/page.tsx; workspace/*.json / workspace/*AUDIT_REPORT.md (subagent ZCode audit evidence)
