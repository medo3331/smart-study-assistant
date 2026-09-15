SECONDARY PROGRESS DB AUDIT — Real Evidence Only (P4, post-Real-Sync)
Status: DOCUMENTATION ONLY. No implementation. No new tables. No Tutor OS. No mastery.
Reference: all _REAL.md files + P2_EXECUTED.md + SECONDARY_INTEGRATION_AUDIT.md + dashboard/page.tsx inspection.

=== A. REAL PERSISTED EVIDENCE (verified from code inspection) ===

1. education_stages (Supabase table)
   - Queried in: app/dashboard/page.tsx (line ~119-128), lib/education/experience.ts
   - Fields used: id, code, name (via stageRow?.code, stageRow?.name implied by mapping)
   - Secondary status: SECONDARY exists as a real stage code (not missing; experience.ts maps it to "secondary")
   - Evidence: real persisted DB relationship; not calculated in UI only.

2. profiles (Supabase table — user profile)
   - Queried in: app/dashboard/page.tsx (line ~156) — persona, university_id, faculty_id, department_id, academic_level_id
   - Used for: determining user role/student status; university branch logic
   - Evidence: real persisted user data.

3. curriculum / lessons content (Supabase + JSON)
   - Referenced in: lib/curriculum-coverage.ts, lib/mock-data.ts, app/lesson/[dayId]/page.tsx
   - Study config/types (types defined in dashboard/components/types) — structure real
   - Evidence: content exists; actual persistence mode depends on DB design (not fully visible in audit scope).

4. XP / economy (coins, level, achievements)
   - Referenced in: lib/shop/economy.ts, lib/shop/shop-data.ts, components/dashboard/secondary/*, app/dashboard/page.tsx (148 matches for economy keywords)
   - Evidence: real persisted gamification/progress-adjacent data. Not mastery evidence — just activity/progress indicators.

5. API routes for goals (secondary, primary, preparatory, university, baccalaureate)
   - app/api/secondary/goal/route.ts exists and has content (28 matches for secondary-related keywords in audit)
   - Evidence: Secondary has its own backend endpoint structure — real, not mock.

=== B. TEMPORARY / CALCULATED (UI state or calculated without sufficient persistent backing for mastery claims) ===

1. Progress display on dashboard (CurrentStepCard, StudySections)
   - These components reference progress but the audit does not confirm a separate, structured student_progress table with per-concept mastery tracking.
   - The existing code calculates/shows progress based on DB relationships that may be at lesson/day/completion level — not deep concept-level.
   - Verdict: can be displayed as temporary progress (completion, score, day progress) but must NOT be labeled as mastery or transfer evidence.

2. SecondaryDashboard components (UI layer)
   - Components exist and are functional at UI level.
   - Integration with deeper learning tracking is incomplete (P2 audit confirmed contradiction in experience resolver; P3 corrected documentation only, not full system integration).
   - Verdict: UI is real; underlying deep-progress tracking is not yet verified.

3. Study session / study day tracking
   - Structure exists (StudyDay, StudyConfig types).
   - Whether every session writes to a persistent progress table or calculates locally is not fully confirmed from inspected source (could be either; audit does not invent).
   - Verdict: treat as provisional until verified per-session persistence is confirmed.

=== C. NOT CURRENTLY AVAILABLE (real gaps for deep-learning progress) ===

1. Per-concept mastery tracking (node-level, prerequisite-level, misconception-level)
   - No evidence of a structured graph or node-level evidence table in inspected source.
   - DATABASE.md theoretical schema (Evidence, NodeMastery, Misconception) is not reflected in actual Supabase queries found.

2. Transfer evaluation records (delayed re-ask, variation task results, teach-back evidence)
   - Not referenced in dashboard or secondary components.
   - Not present in inspected DB query patterns.

3. Fake-fluency detection state (explicit state tracking for students who appear fluent but fail transfer)
   - Not present in source files inspected.

4. Separate exam adapter isolation (hard wall between exam practice and spine mastery)
   - Exam routes exist (goal/route files for stages) but isolation mechanism is not visible in dashboard code.

=== WHAT WE CAN SAFELY DISPLAY TODAY (temporary progress, not mastery) ===

Based ONLY on verified real data:
- Study stage and grade/context (from education_stages + profiles)
- Lesson/day completion (if confirmed by DB relationship for that user)
- Quiz/assessment scores (if assessment routes write results — structure exists)
- XP / coins / achievements (real economy data)
- Study plan / current step indicators (from StudyConfig / day tracking structures)
- Overall progress percentage at a high level (calculated from completed items vs total, not concept mastery)

These are safe to display as "progress indicators" (completion, engagement, score-based) — NOT as deep understanding, mastery, or transfer readiness.

=== WHAT WE CANNOT SAFELY DISPLAY TODAY ===

- Any claim of "mastered this concept"
- Any claim of "ready for next stage based on deep understanding"
- Any transfer-readiness indicator
- Any misconception-corrected status
- Any claim that exam practice results equal spine mastery (adapter isolation not verified)

=== SMALLEST DATA FOUNDATION NEEDED FOR SECONDARY V0 ===

Without implementing new architecture or rebuilding DB:
1. Confirm which DB table/relationship tracks lesson/completion progress for a given user + stage.
2. Confirm whether assessment scores are stored and retrievable for Secondary.
3. Confirm whether study session/day tracking writes persistent records or only calculates in session.
4. Once confirmed, define a temporary progress metric using ONLY those verified fields (e.g., completed lessons / planned days + optional score indicators + economy engagement).
5. Document the metric clearly as temporary and not mastery — consistent with P2_EXECUTED.md rules.

This is the minimum; anything beyond this (graph nodes, transfer tasks, misconception tracking) requires new architecture, not just documentation.

=== RECOMMENDED NEXT STEP (documentation/planning only — no implementation) ===

Review the specific Supabase queries used by:
- dashboard/page.tsx (progress/state fetching)
- components/dashboard/secondary/* (UI data consumption)
- lib/education/experience.ts (stage resolution logic — corrected by P3)
- Any RPC or server action called by these components

Then confirm exactly which fields are real, which are calculated, and document the smallest safe temporary progress definition for Secondary.

No Tutor OS. No new graph. No DB rebuild. No mastery claims.
