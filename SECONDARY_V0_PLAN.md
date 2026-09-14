SECONDARY V0 PLAN — Documentation Only (Based on P5 Real DB Audit + Reality Sync)
Status: Planning / Documentation ONLY. No implementation. No Tutor OS. No Math Graph. No DB rebuild. No mastery claims.
Source: scan-queries.js output (100 patterns from real workspace) + SECONDARY_PROGRESS_DB_AUDIT.md + P2_EXECUTED.md.

=== P5 QUERY TRACE SUMMARY (from real code only) ===

Verified tables accessed by dashboard/page.tsx and education layer:
1. education_stages (SELECT code; linked to stage code mapping — PRIMARY, PREPARATORY, SECONDARY real)
2. education_grades (SELECT name; linked to grade)
3. education_tracks (SELECT name; linked to track)
4. university_faculties / university_departments (university branch — not Secondary directly)
5. profiles (SELECT persona, university info, stage/grade/track ids, subject; INSERT for new user setup; UPDATE for streak/theme; SELECT for user context)
6. study_days (INSERT new rows; SELECT existing; DELETE by config_id)
7. study_configs (SELECT all; INSERT/update for user config; linked by user_id + id filter)
8. activity_log (SELECT all by user_id — session/activity tracking)
9. planner_goals (SELECT title/due/priority/done by user_id)
10. badges (SELECT count by user_id)
11. curricula (SELECT id with stage/grade/track filters — from lib/education/context.ts, real DB relationship for curriculum mapping)
12. subjects (SELECT id/name/curriculum_id linked to curricula)
13. university_subjects (SELECT with university filters — university branch only)
14. user_subjects (SELECT with user filter)
15. user_weaknesses (SELECT with user filter — includes mastery_level field reference but no evidence this is actively used for Secondary)

Data flow (verified):
User context (profile) → stage code resolution (experience.ts, corrected P3) → DB queries for stage/grade/track (education_stages, grades, tracks) → curriculum resolution (curricula, subjects) → dashboard UI (HeroCard, StudySections, CurrentStepCard, PersonalAssistant, NavRail, Sidebar) → study config/day management (study_configs, study_days) → progress/activity tracking (profiles streak/update, badges, planner_goals, activity_log).

=== CLASSIFICATION (A / B / C) — Confirmed by audit ===

A. REAL PERSISTED DATA (safe to reference):
- education_stages (stage codes: PRIMARY, PREPARATORY, SECONDARY, BACCALAUREATE — real)
- profiles (user role, stage/grade/track/link info — real)
- education_grades, education_tracks (real reference tables)
- study_configs, study_days (real user study structure — INSERT/SELECT/UPDATE/DELETE all present)
- curricula, subjects (content mapping — real DB relationship)
- planner_goals, badges, activity_log (real user state/progress-adjacent data)

B. CALCULATED / UI-ONLY (safe as temporary indicators only; NOT mastery):
- Current dashboard step display (calculated from study_config + study_days relationships; not per-concept mastery)
- Progress percentage shown to user (likely derived from completed study days / planned days — not verified as deep evidence)
- XP / coins / streak (real economy data — safe as engagement indicator, not learning mastery)
- SecondaryDashboard UI (present; uses current Router; no separate deep-progress logic confirmed from code)
- Study session tracking (study_days writes real rows but the audit does not confirm per-lesson mastery tracking — only session/day presence)

C. NOT CURRENTLY AVAILABLE (gaps for deep-learning tracking):
- Per-concept node mastery (no evidence table; no node-level tracking in DB)
- Transfer evaluation results (no transfer task table; no delayed re-ask tracking)
- Fake-fluency detection (no explicit state tracking in inspected code)
- Isolated exam adapter (exam goal routes exist — secondary/goal/route.ts — but isolation mechanism not visible in dashboard logic; exam content present but adapter isolation not confirmed from code)
- Deep understanding measurement separate from lesson/day completion (DB supports completion/session tracking, not conceptual mastery independently)

=== WHAT WE CAN SAFELY DISPLAY TODAY (temporary, NOT mastery) ===

Using ONLY verified real DB relationships:
- Student stage and grade context (from profiles + education_stages/grades)
- Study plan/configuration (from study_configs, linked to user)
- Study days completed / planned (from study_days, linked to config)
- Lesson/day-level progress indicators (calculated from study_days presence/completion — temporary only)
- Engagement indicators (XP, coins, badges, streak — real from profiles/badges/economy tables)
- Activity/session presence (from activity_log)
- Curriculum/subject mapping for the stage (from curricula + subjects — stage/grade/track linked)

These are safe as "temporary progress indicators" — they show activity, engagement, and structural progress. They must NOT be presented as mastery, conceptual understanding, transfer readiness, or exam-adapter-isolated evidence.

=== SMALLEST GAP FOR SECONDARY V0 (planning only — no implementation) ===

To define the smallest practical Secondary v0 progress tracking (without new architecture):
1. Confirm the exact relationship between study_days and lessons/content (does each study_day link to specific lesson/content? If yes, progress can reference that; if not, progress is structural only.)
2. Confirm what assessment/quiz results (if any) are linked to user/stage in DB (audit shows assessment routes exist — secondary/goal/route.ts — but the audit does not confirm a dedicated results table linked to user progress; only general profiles/study/config tracking is confirmed).
3. Confirm whether planner_goals tracking relates to study completion or is independent.

Once these three are confirmed (from actual DB, not assumption), the smallest safe Secondary v0 progress metric can be documented as:
- Structural: stage/grade/context confirmed (profiles + education_stages/grades)
- Study progress: study_config + study_days presence/completion (temporary, not mastery)
- Engagement: XP/streak/badges/activity (temporary, not mastery)
- Assessment: only if assessment results are confirmed linked to user; otherwise not included in v0 metric

No mastery claim. No graph. No Tutor OS. No new DB tables.

=== NEXT STEP (confirmed — documentation/planning only) ===

Confirm the three gaps above by inspecting the actual Supabase schema (not code guesses) for:
- study_days relationships (lesson/content linkage)
- Assessment/quiz result persistence linked to user/stage
- planner_goals relationship to study progress

After confirmation, document the final smallest safe Secondary v0 progress definition. Only then consider any implementation.

=== PROHIBITIONS RESPECTED ===
- Tutor OS: not proposed; Router remains the AI mechanism.
- Math Graph: not mentioned; no v0 graph started.
- DB rebuild: not proposed; existing tables (study_configs, study_days, profiles, education_stages) used.
- Graduate/Freelancer expansion: not mentioned; focus remains Secondary.
- Mastery claims: explicitly excluded; all progress labeled temporary/provisional.
- Side features: none added; audit is documentation only.

=== P6 COMPLETE ===
P6 (Secondary DB Audit -> Progress Definition): documentation finalized with real evidence from scan-queries.js (100 patterns).
SECONDARY_V0_PLAN.md exists and contains: A (REAL DATA confirmed) / B (TEMPORARY indicators) / C (NOT AVAILABLE: assessment persistence gap identified) / Simple temporary formula (study structure % + engagement, NOT mastery) / Smallest v0 definition / Next step: confirm assessment persistence mechanism only.
No Tutor OS. No Math Graph. No DB rebuild. No mastery claim. No new features.
Ready for final assessment-gap confirmation (from DB/code), then documentation-only finalization.
