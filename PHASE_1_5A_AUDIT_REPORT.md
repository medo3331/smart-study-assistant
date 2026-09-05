# Phase 1.5A — Live DB Mapping Audit (honest, no fabrication)

A) LIVE MAPPING TABLE — DB CONNECTED (200 OK, not BLOCKED/28P01)
Stage | Grade (code/name) | Curriculum linked | Subjects linked | Status (honest)
Primary (1251d47f) | Grade 1 (P1) | NONE — curricula.stage_id=NULL | 0 | BLOCKED — gap
Primary | Grade 2 (P2) | NONE | 0 | BLOCKED
Primary | Grade 3 (P3) | NONE | 0 | BLOCKED
Primary | Grade 4 (P4) | NONE | 0 | BLOCKED
Primary | Grade 5 (P5) | NONE | 0 | BLOCKED
Primary | Grade 6 (P6) | NONE | 0 | BLOCKED
Preparatory (6e8064a6) | PREP1/2/3 | NONE | 0 | BLOCKED
Secondary (31d24455) | SEC_GEN_1/2/3 | NONE | 0 | BLOCKED
Baccalaureate (4e2dde93) | BACC_1/2/3 | NONE | 0 | BLOCKED
--> Only 1 curriculum exists (GSEC "الثانوية العامة" 3139b04a, stage_id=NULL grade_id=NULL track_id=NULL). Only 1 subject (MATH "الرياضيات" 6d91c3bb, curriculum_id=GSEC). No grade has a curriculum linked; getAvailableSubjects() will return [] for every grade because q.eq("stage_id",ctx.stageId) on curricula yields nothing (curricula has no stage_id set).

B) FILES CHECKED: lib/education/context.ts (30 lines), app/dashboard/page.tsx (line 70 import, 92 ctx, 96 list), db/education-taxonomy-1.2c.5.sql / 1.2f-seed.sql (reference only, not used as source of truth).

C) RUNTIME FLOW (from code): getEducationContext(profile) → {stageId:profile.education_stage_id, gradeId:...}; getAvailableSubjects(supabase,ctx) → supabase.from("curricula").select("id").eq("stage_id",ctx.stageId)[.eq("grade_id",ctx.gradeId)] → ids → supabase.from("subjects").select(...).in("curriculum_id",ids). No hardcoded list.

D) MISSING DATA (honest, not invented): All 15 education_grades and 4 education_stages present; 1 curriculum (GSEC) present but unlinked (stage_id/grade_id NULL); 0 curricula linked to any grade/stage; 1 subject (MATH) exists only for GSEC. Missing: per-grade curricula for all 15 grades; per-stage curriculum rows; subjects for grades other than GSEC. NO migration created; NO curriculum/subject names invented.

E) TS / BUILD: npx tsc --noEmit → exit 0 (clean). npm run build → exit 0 (.next/ produced, 0 error matches). Code integrity OK (integration uses DB queries, not hardcoded list).

F) STATUS: PASS WITH MISSING DATA (DB accessible; code correct; live mapping BLOCKED for every grade due to missing curricula.stage_id/grade_id relations — reported, not fabricated). NOT PASS — mapping not complete. NOT BLOCKED at DB level (connection 200); mapping itself is incomplete.

Evidence files: stages_resp.json, education_grades.json, curricula.json, subjects.json (all from live curl 200 to lgaqgkihhmedtdzcgpnc.supabase.co, anon key sb_publishable_...; exact error 28P01 NOT present — connection worked).
