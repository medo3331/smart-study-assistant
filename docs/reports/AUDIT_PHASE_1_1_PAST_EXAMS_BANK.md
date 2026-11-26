# Phase 1.1 — Past Exams Bank: AUDIT ONLY (NO IMPLEMENT)

Status: AUDIT COMPLETE. NO implementation executed. NO DB changes. NO UI. NO API. NO AI. NO commit. NO push.
Branch: main. Build: PASS (✓ 15.4s, 78 static pages, 0 TS errors). Source: C:\Desktop\smart-study-assistant (Magicly — Next 16 / React 19 / Tailwind v4 / Supabase SSR auth + anon sessions; remote github.com/medo3331/smart-study-assistant).

---

## A. Existing Exam Infrastructure (what IS there for exam-related features)

- `app/assessment/page.tsx` (30KB, client) — AI Placement Quiz (3 questions, builds flexible plan from answers; uses `lib/user-persona`, localStorage, `createClient`). Not a past-exam bank; initial diagnostic.
- `app/ai-study-assistant/page.tsx` — marketing/landing for AI Study Assistant (summarize, explain, generate questions, plan); not a bank.
- `components/ExamPlanCard.tsx` + `lib/exam-plans.ts` — “Emergency Exam Plan” (countdown to a single upcoming exam: `exam_plans` + `exam_plan_days` tables; day-kind = content/review/quiz; RLS owner-only). Not past exams — forward-looking study plan.
- `lib/exam-intent.ts` — detects “exam in 3 days” from chat text (pure, no date parsing bugs); feeds `ExamPlanCard`.
- `lib/ai/agents/exam-solver.ts` — AI exam solver agent (`AgentId = "exam_solver"`), solves step-by-step, supports vision, never invents. Optional future layer.
- `lib/ai/agents/quiz-generator.ts` — AI quiz generator from lesson context; never invents; supports MCQ/T-F/fill/short.
- `components/CommunityQuiz.tsx` — 10-question AI-generated quiz per `subject`; results → `submit_quiz_result` RPC (`community_quiz_scores`). Again AI-generated, not official past exams.
- `db/exam-plans.sql` (8.4KB) — SQL for `public.exam_plans` (user_id, subject, exam_date, source_text, is_archived) + `public.exam_plan_days` (plan_id, user_id, day_number, study_date, kind∈{content,review,quiz}, is_done); RLS owner-only; indexes. NO past exam schemas.
- No route `app/**/past-exam*`, `app/**/exam-bank*`, `app/**/past*`, no `exam_bank`, `past_exams` table, no past-exam page, no exam-bank component.
- `app/admin/components/PlanAdminCard.tsx` — admin only for billing/plan settings, NOT content management of exams/lessons/questions.
- Existing content-management for materials: `public.materials` (`db/pages.sql`): user-uploaded docs with `file_type`, `file_size`, `content`, `summary`, `note`, RLS owner-only. Good reuse pattern for exam PDF storage link, but no exam-specific fields (year, exam, answer_key, curriculum, country).
- No `official_answer_model`, `answer_key`, `marking_scheme`, `question_to_answer_mapping`, `exam_pdf`, `past_exam`, `curriculum`, `country`, `academic_year` anywhere in DB/code.

---

## B. Existing Database (exam-related objects only; full DB = 35 tables via SQL files)

Exam-related tables confirmed (from `db/*.sql` grep):
- `public.exam_plans` (`db/exam-plans.sql` L32) — single upcoming exam plan per user.
- `public.exam_plan_days` (`db/exam-plans.sql` L73) — study-plan days (content/review/quiz).
- `public.community_quiz_scores` (`db/community.sql` L39) — AI quiz results (user_id, week_key, subject, best_score, best_total, best_accuracy, attempts, xp_today, xp_today_date, updated_at; PK user+week).

NO past-exam, exam-bank, exam-question, exam-answer, country, curriculum, subject-taxonomy, academic-year tables.

Related reusable tables (for future linkage, NOT duplication):
- `public.materials` (`db/pages.sql` L26) — user uploads (PDF/text) with RLS; can hold exam PDFs if extended with metadata fields (year, subject, exam type).
- `public.profiles` (`db/auth-phase1.sql`) — `persona` (student/grad/freelancer) → generated `role`; `subject` (field/track text, not taxonomy); `educationLevel`; `onboarded_at`.
- `public.planner_goals` (`db/pages.sql`) — study-plan goals; could reference an exam record.
- `public.ai_agent_generations`, `ai_operations`, `ai_memories` — AI layer; `exam_solver`/`quiz_generator` agents write/read here.
- `public.chat_conversations`, `chat_messages` — where `exam-intent` is detected.

RPCs / functions (from SQL / code searches):
- `submit_quiz_result` (used by `CommunityQuiz`) — computes XP + leaderboard update server-side.
- No RPC for past exam fetch, filter, answer-key retrieval.

RLS (from `db/exam-plans.sql` and others):
- `exam_plans`: owner select/insert/update/delete (auth.uid()=user_id)
- `exam_plan_days`: owner + cross-check `plan_id` belongs to user; `kind` check constraint (content/review/quiz)
- `materials`: owner-only; `community_quiz_scores`: owner-only
- NO RLS for a public past-exam bank (would need separate policy design — public read vs admin write).

---

## C. Existing UI (pages/components that touch exams/assessment/quiz)

- `app/assessment/page.tsx` — AI placement quiz (3 questions, flexible-plan output). Client, localStorage, `user-persona`.
- `app/ai-study-assistant/page.tsx` — static marketing.
- `app/plans/page.tsx` + `actions.ts` — study plan management (related to `exam_plans` via `lib/exam-plans`).
- `components/ExamPlanCard.tsx` — emergency exam countdown card on dashboard (uses `fetchActiveExamPlan`, `archiveExamPlan`, `todayISO`). NOT a bank.
- `components/CommunityQuiz.tsx` — 10-question AI quiz (subject-driven).
- `app/lesson/[dayId]/page.tsx` — contains `UnifiedChat` that can call exam-solver / quiz-generator agents via `agent-intelligence`; can reference `lesson` content (not past exams).
- `app/admin/page.tsx` — admin dashboard (billing settings, user management); NO exam content admin.
- `app/study-tools/page.tsx` — study tools index.
- `app/dashboard/` — dashboard family (includes exam-plan card, study progress, XP/coins, missions, rewards).
- NO `app/past-exams/` page, NO `components/PastExamBank/*`, NO `components/ExamFilter/*`, NO `components/AnswerKeyViewer/*`.

Search / filter components for exam bank: NOT FOUND. Existing filter/search patterns (if any) are likely in dashboard/community pages but NOT specialized to exam hierarchy (Country→Curriculum→Subject→Year→Exam).

---

## D. Existing Storage (file / PDF)

- Supabase Storage: code uses `createClient()` / `createServerClient()`; NO explicit bucket config in SQL files or `lib/supabase/` docs. `db/pages.sql` `materials` stores file metadata (`file_type`, `file_size`) but NOT a `file_path` to storage — implies storage URL may be stored elsewhere or handled by app code (check `lib/pages-data.ts`).
- `lib/pages-data.ts` (L96–147): selects `file_type`, maps to `fileType`; no `storage_path` / `bucket` / `url` field visible — likely handled outside DB or missing in audit scope.
- No `public/` vs `private` bucket policy shown; no `signed_url` helper found; no upload/download utility file found under `lib/` in audit.
- Verdict: storage infrastructure EXISTS at Supabase level (project configured), but NO exam-specific bucket / policy / upload utility is configured. Existing `materials` pattern can be extended (add `exam_id` reference + `storage_url` column) rather than new bucket, if desired.
- No exam PDF, answer PDF, image, question-paper storage currently present.

---

## E. Existing Admin / Content Management

- `app/admin/page.tsx` — admin dashboard (billing/plan settings via `PlanAdminCard`; user/role management via `admin-management.ts`; premium-trial actions).
- `app/admin/components/PlanAdminCard.tsx` — billing settings only.
- `app/admin/actions/admin-management.ts` — admin user management.
- `app/admin/actions/entitlement-grant.ts` — entitlement grants.
- `app/admin/actions/premium-trial.ts` — trial consumption.
- NO admin UI for: adding courses/lessons/questions/assessments/exams, uploading exam PDFs, managing answer keys, editing curriculum/subject taxonomy, managing countries.
- Existing content workflow (`materials`) IS owner-only user-upload; no admin moderation / approval flow shown.
- Verdict: existing admin CANNOT currently manage exam content. Could extend `admin/page.tsx` with new cards/sections later (after approval), but must not modify billing/settings cards now.

---

## F. Existing AI (reusable for future optional layer)

- `lib/ai/agents/exam-solver.ts` (`AGENT_ID = "exam_solver"`) — solves exam questions step-by-step; supports vision/image input (`withImageUnderstanding`); NEVER invents; multilingual (ar/en); uses `AgentRouter`. Can be linked to Past Exams as: “upload exam question image → get AI explanation / comparison” — but AI answers must NOT replace official answer keys.
- `lib/ai/agents/quiz-generator.ts` (`AGENT_ID = "quiz_generator"`) — generates practice questions from lesson context; never invents. Could generate PRACTICE quizzes linked to a past exam (as study aid), not as official exam data.
- `lib/ai/agents/document-analyzer.ts` — extracts questions/answers/summary from uploaded docs; could pre-process exam PDFs (extract text, detect questions) — but output is AI-derived, not official.
- Rule enforced by audit: Phase 1.1 MUST NOT include AI grading, AI answer generation for official answers, AI exam creation. AI stays optional future layer.
- Link point for future: `exam_solver` + `quiz_generator` can consume `subjects` and `exam` records (once DB exists) via context (`preferences.subject`, `preferences.level`, `preferences.role`). No DB dependency yet.

---

## G. Country / Curriculum / Education System / Subject Taxonomy Support

AUDIT FINDING — EXPLICITLY MISSING (do NOT invent):

- `country`: NO table, NO column in `profiles`, NO enum, NO route, NO component, NO CSV/seed file.
- `curriculum`: NO table/column (no `curricula`, `curriculum` anywhere in DB/code except audit prompt vocabulary).
- `education_system`: NO table/field.
- `academic_year`: NO table/column; `exam_date` (date) exists in `exam_plans` but is event-specific, not a taxonomy.
- `subject taxonomy`: PARTIAL — `profiles.subject` (text), `community_quiz_scores.subject` (text), `materials` (no subject), `exam_plans.subject` (text), `user-persona.FIELD` (text keys like “برمجة”, “طب”). No normalized subject table, no curriculum mapping, no hierarchical taxonomy (Country→Curriculum→Subject→Year). `STUDENT_LEVELS`: `prep` / `high` / `uni` / `masters` — these are student levels, NOT academic years.
- `student_level`: EXISTS (`STUDENT_LEVELS` in `lib/user-persona.ts`, mapped to `profiles` via persona/level fields).
- `grade / year`: NO table. `exam_plans.exam_date` provides a specific exam date; `study_date` provides study-day dates; neither defines an academic-year taxonomy.

Verdict: the required hierarchy `Country → Curriculum → Subject → Year → Exam → Questions → Official Answers` is NOT supported by the current project. Must build taxonomy tables (or seed from real sources) in a future step AFTER audit approval — NOT now.

---

## H. Gaps (exactly what is missing for Past Exams Bank)

1. Database: NO `past_exams` / `exam_bank` / `exam_questions` / `exam_answers` / `official_answer_keys` / `answer_model` tables.
2. Taxonomy: NO `countries`, `curricula`, `subjects` (normalized), `academic_years`, `education_systems`.
3. Content: NO real past exam PDFs, NO official answer PDFs, NO model-answer documents, NO exam metadata (year, exam session, board/authority).
4. Storage: NO exam-specific bucket / upload flow for exam PDFs + answer-key PDFs + question images.
5. Admin: NO admin content-management for exam data (add/edit/publish exam + answers).
6. UI: NO bank browsing page, NO filter bar (Country/Curriculum/Subject/Year/Exam), NO exam-detail page, NO answer-key viewer, NO download link.
7. Search/filter components: NOT EXISTING for exam hierarchy.
8. AI linking: `exam_solver`/`quiz_generator` exist but have no DB hook to past-exam data (intended future, not now).
9. RLS: NO policy for public-read exam bank + admin-write (current RLS is owner-only everywhere).
10. Answer model: NO official answer key, NO marking scheme, NO question-to-answer mapping.
11. Content strategy: NO defined source for real exams (ministry/board/university PDFs), NO ingestion workflow, NO verification process for “official” status.

---

## I. Recommended Architecture (reuse > extend > create new; no duplication)

Based on audit (reuse existing patterns; extend where appropriate; create new ONLY where proven missing):

### Taxonomy (NEW — only after approval; must be seedable from real sources):
```
public.countries       (id, name_ar, name_en, region, iso_code?)
public.curricula       (id, country_id, name_ar, name_en, level_range?)
public.subjects        (id, curriculum_id, name_ar, name_en, category?) — or normalized separately
public.academic_years (id, curriculum_id, year_label, start_date?, end_date?)
```
Note: DO NOT create if real data source is unknown; prefer to seed from verified ministry/board sources. If taxonomy not needed for Phase 1.1, skip entirely until approved.

### Exam Bank (NEW table — only after approval):
```
public.past_exams (
  id, country_id, curriculum_id, subject_id, year_id,
  exam_type (text/enum: final/midterm/placement/...),
  exam_session (text: "2024-2025", ...),
  exam_title (text),
  exam_pdf_url / exam_pdf_path (reference to storage),
  source_authority (text: ministry/board/university),
  source_verified (boolean),
  created_by (admin user_id), created_at, updated_at
)
```
Reuse `public.materials` pattern (file metadata + RLS) but add exam-specific fields via extension (new table, NOT modify materials extensively to avoid breaking user uploads).

### Questions (NEW — linked to exam):
```
public.exam_questions (
  id, exam_id, question_number (int), question_text (text),
  question_image_url?, question_type (mcq/short/essay/...),
  marks (int), created_at
)
```

### Official Answers / Model Answers (NEW — critical; not AI-generated):
```
public.exam_answers (
  id, question_id, answer_text (text), answer_pdf_url?,
  marking_scheme (text), is_official (boolean),
  source_authority (text), verified_by (user_id/admin),
  created_at
)
```
Or combine: `public.exam_answer_keys` (exam-level PDF + question-level mapping).

### Link to Existing (reuse, don’t duplicate):
- `profiles.subject` (text) → can be mapped to `subjects.id` once taxonomy exists (migration optional).
- `exam_plans` / `plan_days` → can reference `past_exams.id` in future (e.g., “study this past exam for next week’s final”). Not needed now.
- `materials` → can link `material_id` to `past_exam.id` if exam PDFs are stored as materials (extension); prefer separate table for data integrity.
- `community_quiz_scores` — separate; past exam bank does NOT replace community quiz; they serve different purposes.
- `ai_agents` (exam_solver, quiz_generator) — future link: pass `subject` + `level` context; optionally pass `exam_id` to ask “explain question 5 from this official exam”. Must remain optional.
- `chat/messages` — future: detect “where is past exam for Math 2023” → route to bank. Not Phase 1.1.

### Hierarchy (as requested):
```
Country → Curriculum → Subject → Year → Exam → Questions → Official Answers
        (optional future: Exam → Attempt → User Answers → Manual Comparison → AI Analysis)
```
Only implement top row now; bottom row (attempt/comparison/AI) explicitly deferred.

---

## J. Proposed Implementation Files (for NEXT step — only after approval; not now)

DO NOT create/modify until user approves Phase 1.1 → Implementation.

If approved, suggested order (each step = approval sub-step per user workflow):
1. `db/past-exams-taxonomy.sql` — `countries`, `curricula`, `subjects`, `academic_years` (ONLY if real sources identified; else skip and use text fields temporarily).
2. `db/past-exams-bank.sql` — `past_exams` table + `exam_questions` + `exam_answers` / `answer_keys`; RLS policies (public read for verified exams; admin write); indexes; constraints.
3. `lib/past-exams.ts` — data-layer functions (`fetchPastExams(filters)`, `getExamWithAnswers(id)`, `getOfficialAnswer(question_id)`); uses `Result<T>` pattern (like `exam-plans.ts`).
4. `components/PastExamBank/` — bank root + filter bar + exam cards.
5. `components/ExamFilter/` — hierarchy selectors (Country/Curriculum/Subject/Year/Exam). Reuse styling from `ExamPlanCard` / dashboard cards.
6. `app/past-exams/page.tsx` — bank browse page.
7. `app/past-exams/[examId]/page.tsx` — exam detail (questions + official answers, not AI answers).
8. `app/past-exams/admin/page.tsx` (or extend `app/admin/page.tsx`) — admin upload/manage exam + answers; requires admin role check (existing `site_admins` / `profiles.role`).
9. `lib/storage/exam-upload.ts` (NEW, small) — upload exam PDF + answer PDF + question images to Supabase Storage; reuse `materials` upload logic if available; else minimal helper.
10. Update `lib/user-persona` / `profiles.subject` only if taxonomy mapping needed (defer).

NOT proposed (out of scope per audit instructions):
- No `db/past-exams.sql` created now.
- No `app/past-exams/` routes created now.
- No AI grading / AI official-answer generation.
- No coins/XP/leaderboard integration.
- No notifications.
- No Phase 1.2 Diagnostic Quiz, 1.3 Curriculum Mapping, 1.4 Countdown.

---

## K. Database Changes Required (for future implementation — NOT executed)

Based on audit (no SQL executed; this is proposal only):

New tables (proposed, subject to approval and real-data availability):
- `public.countries` (if taxonomy approved)
- `public.curricula` (if taxonomy approved)
- `public.subjects` (normalized, if taxonomy approved; else use existing `profiles.subject` text + `community_quiz_scores.subject` temporarily)
- `public.academic_years` (if taxonomy approved)
- `public.past_exams`
- `public.exam_questions`
- `public.exam_answers` (or `exam_answer_keys` at exam level + question mapping)

New fields (optional extensions to existing):
- `public.materials`: add `exam_id` (nullable FK to past_exams) if using materials for exam PDFs; OR keep separate.
- `public.profiles`: no change required for Phase 1.1; taxonomy mapping can be deferred.

Migration / SQL: create `db/past-exams-bank.sql` (new file) + possibly `db/past-exams-taxonomy.sql` (new file). Do NOT modify `db/exam-plans.sql`, `db/auth-phase1.sql`, `db/community.sql`, `db/pages.sql`, `db/admin-roles.sql` — they serve other phases and must not break.

RLS: new policies for `public.past_exams` (select for all verified records; insert/update/delete for admin only; or owner+admin). Must be designed separately from `exam_plans` (public-read vs owner-only are opposite patterns).

Indexes: `past_exams(country_id, curriculum_id, subject_id)`, `past_exams(year_id, exam_type)`, `exam_questions(exam_id, question_number)`, `exam_answers(question_id)`. Reuse index naming (`_user_`, `_plan_`, `_date_`) as convention.

---

## L. Content Strategy (real exams — NOT mock/demo/AI-generated)

AUDIT FINDING — EXPLICITLY STATED IN PROMPT AND VERIFIED:
- No past exam PDFs currently in repo, storage, or DB.
- No official answer keys currently stored.
- `materials` contains only user-uploaded content (unknown whether it includes exam PDFs; not verified in audit, but no exam-specific metadata confirms it).
- `exam_solver` / `quiz_generator` produce AI-derived outputs — NOT official.
- `assessment/page.tsx` and `CommunityQuiz` use AI-generated questions — NOT official past exams.

Recommended content strategy (for AFTER audit approval, NOT now):
1. Identify verified sources: Ministry of Education exam archives, university examination offices, official board websites, accredited publishers’ past-paper series.
2. Obtain official PDF + answer PDF (or official answer booklet) from these sources — not screenshots, not AI summaries.
3. Ingest via admin workflow (future `admin/page.tsx` extension): upload exam PDF + answer PDF; extract question list (manual or via `document-analyzer` with HUMAN verification — AI extraction must be verified); enter official answers with source citation (`source_authority`, `verified_by`).
4. Mark `source_verified = true` ONLY after human review; unverified records stay `false` and do NOT appear in public bank.
5. Do NOT use AI (`quiz-generator`, `exam_solver`) to generate “official answers” — those stay in separate AI-practice layer (future `Attempt → User Answers → AI Analysis`).
6. Content ownership: exams are public-domain / government-published in most jurisdictions; verify copyright / usage rights for each source. Note: this is a legal/content concern, not a technical one.

For audit: note that NO content ingestion has started, NO mock data has been inserted, NO placeholder exams created. The correct state is “empty bank, real data required before any UI shows content.”

---

## M. Risks

Technical:
- New taxonomy tables (`countries`, `curricula`, `subjects`) may conflict with existing `profiles.subject` text field and `community_quiz_scores.subject` — migration / mapping needed if both coexist.
- RLS change from owner-only (`exam_plans`, `materials`) to public-read (`past_exams`) requires careful policy design; wrong policy = data leak or empty results.
- Storage bucket / upload flow not fully configured in audit; if storage URL missing, exam PDF links will break.
- `lib/pages-data.ts` / `materials` pattern missing explicit `storage_url`; extending it for exams must not break existing materials RLS/query.
- Build passes (0 TS errors) but new files (`lib/past-exams.ts`, components) could introduce errors; must verify with `npm run build` after each implementation sub-step.
- `is_archived` / `kind` constraints (from `exam_plans`) demonstrate the project’s preference for DB-level constraints over app-level validation; new tables should follow (`check (kind in (...))`, `not null`, `unique` where appropriate).

Data / Content / Legal:
- No verified official exam sources identified yet; ingesting unverified content risks false “official” label.
- AI-generated answers (`quiz-generator`, `exam_solver`) must never be presented as official; clear UI distinction required (e.g., “AI practice” vs “Official Answer Key”).
- Copyright / usage rights on ministry PDFs vary by country; must verify per source.
- User-uploaded exam PDFs via `materials` could be mistaken for official; need `source_verified` flag + admin approval.
- No duplicate-prevention mechanism exists for same exam from different sources; `past_exams` may need `unique (country_id, curriculum_id, subject_id, exam_session, exam_type)` or external dedup workflow.

Process / Scope:
- User requires PREVIEW-FIRST + approval at each step (standing rule in memory + profile). Implementation must NOT proceed past audit without explicit “approved”.
- No git commit / push allowed now (audit rule + user standing rule).
- Phase 1.2 (Diagnostic Quiz), 1.3 (Curriculum Mapping), 1.4 (Countdown) are explicitly out of scope; must not be started.
- AI layer (exam_solver, quiz_generator) must remain optional; no AI grading / AI official-answer generation in Phase 1.1.

---

## N. Baseline (verified with real output)

- TypeScript: 0 errors (`tsc --noEmit`; `grep -c 'error TS'` = 0 after build).
- Build: PASS (`npm run build`; `✓ Compiled successfully in 15.4s`; `✓ Generating static pages using 7 workers (78/78)`; exit 0).
- ESLint: not independently verified in audit (build includes lint pass per project config); no new lint errors introduced (nothing changed).
- Branch: `main`; clean (`git status --short` empty); recent commits include Phase 0.5 (trial RPC + UI) and Phase 4.11 fixes (admin form / revalidatePath). Nothing exam-bank-related in history.
- No DB modifications made (verified: `db/*.sql` untouched; no `ALTER` executed; no new tables created; `git status` clean).
- No UI components created/modified (verified: `components/ExamPlanCard.tsx`, `CommunityQuiz.tsx`, `ExamPlanCard`, `app/assessment/page.tsx` untouched; no new `.tsx` created).
- No new routes created (verified: `app/` directory listing unchanged; no `past-exams/` directory).
- No AI modifications (verified: `lib/ai/agents/exam-solver.ts`, `quiz-generator.ts`, `document-analyzer.ts` untouched; no new agent created; no prompt changes).
- Storage: no new bucket / policy / file created (verified: no new `storage/` directory, no new file uploads, no `supabase/storage` commands executed).
- Audit file written to workspace (this file) — is the ONLY new artifact; does not affect build or runtime.

---

## Scope Control — Confirmed Not Executed (per prompt §11 and user rules)

❌ No `public.past_exams` / `exam_bank` table created. ❌ No SQL migration. ❌ No UI. ❌ No API route. ❌ No exam content inserted. ❌ No countries / curricula added. ❌ No `db/*exam-bank*.sql`. ❌ No AI grading / generation. ❌ No coins/XP rewards. ❌ No leaderboard. ❌ No notifications. ❌ No Phase 1.2 / 1.3 / 1.4 started. ❌ No git commit. ❌ No git push. ❌ No preview shown (this audit IS the report; implementation preview will come ONLY after approval, per preview-first rule).

---

## Final Audit Statement (for user review before approval)

Phase 1.1 Past Exams Bank = AUDIT ONLY, COMPLETE. Nothing implemented. Existing exam infrastructure (`exam_plans`, `assessment` placement quiz, `ExamPlanCard`, `exam_solver`/`quiz_generator` agents, `CommunityQuiz`, `materials`) is documented in sections A–F above and is NOT duplicated by the proposed bank. Taxonomy (Country/Curriculum/Subject/Year) is explicitly missing (section G) and must be built / seeded from real sources before content ingestion (section L). Recommended architecture (section I) reuses `materials` RLS pattern, `Result<T>` data layer, `ExamPlanCard` styling, and existing agent layer — creates new tables only for exam bank + questions + answers, extends admin page for content management, and defers AI comparison / attempt tracking to future phases. Build and TypeScript baseline verified (section N). No git changes.

STOP — do NOT proceed to implementation. Await user review and explicit approval (separate message) before any file edits, DB changes, or UI creation.
