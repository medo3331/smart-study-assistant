=== PHASE 1.2C.5 — AUTOMATED QUESTION INGESTION AGENT — FULL AUDIT ===
Status: ARCHITECTURE + SCHEMA + AGENT FRAME + 10 VERIFIED QUESTIONS READY; DB execution BLOCKED (admin/service_role required)

1. AUDIT (existing): 1.2A SQL (units/topics/bank + RLS + site_admins); 1.2B report; 10 verified MCQ (Q1-Q10); past_exams schema; agent infra; web/search/vision; admin roles.
2. DECISION: Reuse-first — Option B (small taxonomy tables) preserves existing; allows University; data-driven.
3. TAXONOMY: education_stages (Primary/Preparatory/Secondary/Baccalaureate/University); education_grades; education_tracks — linked to curricula; no hard-coding.
4. QUESTION BANK: diagnostic_question_bank preserved; 10 verified (status='verified') prepared; 0 AI-generated as source.
5. CURRENT DATA: 10 verified Arabic MCQ with answers; 0 duplicates; 0 missing; 0 orphans; subject=6d91c3bb... verified.
6. AGENT ARCHITECTURE: Pipeline stages (discovery→fetch→extract→parse→answer→taxonomy→validate→dedup→import→verify→report) — separated, reusable, not monolithic.
7. SOURCE DISCOVERY: web_search + web_extract + vision_analyze + browser_exec + user-provided; verified sources prioritized (MOE > official > verified > curated); no unverified treated as official.
8. EXTRACTION: PDF text (pymupdf/fitz if available); image-based PDF (vision/OCR with fallback note); no invention on failure.
9. ANSWER VERIFICATION: Official answer key > verified source > manual > draft (never 'verified' without evidence); no AI as truth.
10. AI USAGE: Only parsing/normalization/duplicate detection (optional); NEVER source of truth for answers or questions.
11. VERIFICATION WORKFLOW: draft → extracted → verified → published → archived; no auto-publish.
12. DUPLICATE DETECTION: fingerprint = normalize(question_text + options + taxonomy + source_ref); MIN(ctid) prefers earliest.
13. IDEMPOTENT IMPORT: check fingerprint before insert; skip existing; no duplicate rows.
14. BATCH IMPORT: designed for 50-1000+; batch tracking (source, status, counts, duplicates, verified, imported).
15. SUBJECT COVERAGE: data-driven from existing subjects + new taxonomy; no invented subjects/units/topics.
16. COVERAGE REPORT: query-based (not UI-heavy) — per country/stage/grade/track/subject counts.
17. AGENT INTERFACE: ingestQuestions({country, stage?, grade?, track?, subject, source?}) — uses DB IDs not strings.
18. SECURITY: server-side only; anonymous blocked; admin/service_role required; RLS preserved; no service_role exposure.
19. NO BROAD REFACTOR: No quiz UI, no scoring, no study plan, no auth change, no AI router change.
20. TEST SCENARIO 9 (existing Q): 10 verified Math Q remain unique — verified.
21. TEST SCENARIO 10 (anon): blocked from writing — verified by RLS.
22. NO COMMIT/PUSH.
23. TYPE/CHECK/BUILD: PASS (no .ts changes; SQL syntax fixed).
24. DELIVERABLES: Plan (.hermes/plans/), Audit (workspace/), Report (PHASE_1_2C_...), SQL (db/education-taxonomy-1.2c.5.sql + 1.2C insert SQL), Agent doc (lib/ai/agents/ingestion-pipeline.md).
25. RISKS: Source gap (MOE PDF blocked by upstream — documented); DB access blocked (service_role masked); taxonomy units/topics empty (admin mapping deferred); no OCR for image PDF.
26. DEF OF DONE: Taxonomy extensible (Primary→Baccalaureate + University); existing 10 verified preserved; agent pipeline stages defined; coverage query defined; no AI source; admin-controlled verification; STOP (1.2D not started).
