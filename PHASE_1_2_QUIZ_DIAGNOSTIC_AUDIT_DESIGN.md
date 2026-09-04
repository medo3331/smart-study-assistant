# Phase 1.2 — Quiz Diagnostic: AUDIT + DESIGN

**Status:** AUDIT + DESIGN ONLY — NO IMPLEMENTATION  
**Branch:** main (from Phase 1.1)  
**Baseline verified:** `npx tsc --noEmit` PASS, `npm run build` PASS  
**Modified source files in this phase:** NONE (only this design doc added)  
**Rule applied:** REUSE FIRST — existing quiz/assessment infrastructure audited before proposing new tables/APIs/components.

---

## 1. CURRENT ARCHITECTURE (Audit Summary)

Repo: `smart-study-assistant` (Next 16 / React 19 / Tailwind v4 / Supabase SSR auth + anon).  
App router (`app/`) + Pages router (`pages/`) hybrid; proxy-based auth (`proxy.ts`).  
DB access via Supabase client + server-only `service_role` mutations (Phase 4.11 rule).

### 1.1 Existing Assessment / Quiz Paths (verified via filewalk)

| Path / File | Type | What it is | Reusable for Diagnostic? |
|---|---|---|---|
| `app/assessment/page.tsx` + `layout.tsx` | Page | Static 3-question **Placement Quiz** (AI Placement — level/pace/style from persona); answers mapped to `level/style/pace` locally; no DB persistence of answers. Not diagnostic. | **UI pattern only** (phases, state); scoring logic NO |
| `components/CommunityQuiz.tsx` | Component (412 lines) | AI-generated 10-Q MCQ; `QuizQuestion` (question/options/correctIndex); phases `loading/intros/quiz/result`; submits to server RPC for `score/accuracy/xp`; anti-duplicate `submittedRef`; reads `subject`; guest mode. | **UI/component pattern YES** (state machine + submit flow); **question source = AI only = NOT deterministic scoring truth** |
| `lib/ai/agents/quiz-generator.ts` | Agent (66 lines) | AI generation only; returns structured output (MCQ/T/F/Fill/Short); requires `AgentRouter`; uses lesson context; no DB save; no correct-answer persistence; not a scoring source. | **None for diagnostic scoring**; optional explanation layer later |
| `app/api/ai/route.ts`, `unified-ai/route.ts`, `generate-game-questions/route.ts`, `agent/generate/route.ts` | API | AI generation endpoints; no persistent question bank; no deterministic validation layer. | **None** |
| `db/past-exams-bank-foundation.sql` (Phase 1.1) | SQL (7 tables) | `countries`, `curricula`, `subjects`, `academic_years`, `past_exams`, `past_exam_questions`, `past_exam_answers`. Taxonomy: country → curriculum → subject → academic_year. **NO unit/chapter/lesson/topic.** | **Taxonomy linkable** (subject + curriculum + academic_year) for future diagnostic routing; NOT a question bank |
| `db/community.sql` | SQL (268 lines) | `community_quiz_scores` (user_id, week_key, subject, best_score, best_total, best_accuracy, attempts, xp_today, updated_at) + 3 server RPCs (security definer). RLS enabled. | **REUSABLE scoring pattern YES** — user/subject/week + score/total/accuracy/attempts + RLS |
| `db/break-zone.sql` | SQL | `break_riddle_sessions`/`break_game_claims` — quiz/attempt/answer concepts but for riddles, not academic. | **Concept reuse only** |
| `db/gamification.sql` | SQL | `break_quiz_sessions` (quiz/attempt/answer) + `escape_puzzles`/`escape_sessions`; `subject` + `topic` fields present; RLS. | **Concept reuse**; closest existing attempt/answer table pattern |
| `db/exam-plans.sql` | SQL | `exam_plans` + `exam_plan_days`; links to `subject`; `study_day` references. | **Integration point** (study-plan / exam-plan link) |
| `db/pages.sql` | SQL | `materials`, `planner_goals`, `career_skills`, `badges`; `subject`/`chapter` columns; study-day references. | **Integration point** for recommendation routing |
| `db/ai-learning.sql` | SQL | `ai_memories` (subject/lesson/topic); minimal. | **Concept only** |

### 1.2 Key Finding — No Unified Curriculum Taxonomy

- `past_exams`: `subject` ✓, `curriculum` ✓, `academic_year` ✓, `country` ✓ — **NO `unit/chapter/lesson/topic`**.
- `community.sql`: `subject` + `unit` ✓ — **NO chapter/lesson/topic**.
- `gamification.sql`: `subject` + `topic` ✓ — **NO unit/chapter/lesson**.
- `pages/sql`: `subject` + `chapter` ✓ — **NO unit/lesson/topic**.
- `profile-persona.sql`: `profiles.persona` ('student'/'grad'/'freelancer') + `profiles.subject` (text) — **NO grade/stage/track/country/curriculum/academic_year on profile**.

**Gap:** No `subject → unit → chapter → lesson → topic` hierarchy exists in any single schema. Diagnostic that needs "weak topic → related lesson → study recommendation" must either (a) create minimal taxonomy, or (b) link weak topic to `subject` + `planner_goal` + `materials` only (lower fidelity, no new tables). Design picks (b) for MVP.

---

## 2. EXISTING QUIZ / ASSESSMENT SYSTEMS — REUSE ANALYSIS

### 2.1 Assessment Page (`app/assessment/`)
- **Type:** Static placement quiz (3 questions, hard-coded in TSX).
- **Scoring:** Deterministic mapping (option → level/pace/style).
- **Persistence:** None to DB (only `localStorage` / persona context via `lib/user-persona`).
- **Diagnostic reuse verdict:** UI pattern reusable; scoring logic not reusable (placement ≠ diagnostic); NO DB persistence to extend.

### 2.2 CommunityQuiz (`components/CommunityQuiz.tsx`)
- **Type:** AI-generated 10-question weekly quiz.
- **Source of truth:** AI only (`quizGeneratorAgent` / AI route). `correctIndex` returned by AI per session — not persisted, not validated.
- **Persistence:** Score only via server RPC (`submit_quiz_result`) to `community_quiz_scores`; questions never saved.
- **Anti-abuse:** `submittedRef` prevents double-submit; server computes score (client only sends answers / score? — verify via `community.sql` RPCs needed; design assumes server-side validation for MVP).
- **Diagnostic reuse verdict:**
  - Component state machine (phases, progress, submit) → **reuse**.
  - `QuizResult` interface (score/total/accuracy/isNewBest/xpEarned) → **reuse**.
  - AI-as-question-source → **NOT reusable** for diagnostic scoring truth (design requires verified correct answers; AI can supplement explanation/recommendation only).
  - Weekly-score persistence pattern → **reuse concept**; diagnostic needs attempt-level (per-submission) not weekly-best.

### 2.3 Quiz Generator Agent (`lib/ai/agents/quiz-generator.ts`)
- **Type:** AI content generator, not scorer.
- **Output:** Structured text (questions + options + correct answers + explanation).
- **Validation:** "Only from provided context / lesson data. No invented questions." — but no independent verification layer.
- **Diagnostic reuse verdict:** **Optional only** — can generate explanations / recommendations; must NOT be source of scoring truth. Design: deterministic scoring from verified answers; AI only for optional recommendation text.

### 2.4 Existing Data Model — What's Actually Present

| Concept | Existing Table(s) | Columns Relevant | Reusable? |
|---|---|---|---|
| User / attempt | `community_quiz_scores` (weekly best — not per-attempt) / `break_quiz_sessions` / `gamification` keys | user_id, subject, score, accuracy, attempts | Pattern yes; per-attempt table needed |
| Answers (per question) | `past_exam_answers` (past exams only) / `gamification` conceptual | user_id, question_ref, selected, correct?, timestamp | Only past-exams has true answer records; diagnostic needs new attempt-level answers |
| Questions (verified) | `past_exam_questions` (bank for past exams) / AI generation | id, text, options, correct_option, subject, difficulty | `past_exam_questions` is verified bank — linkable; diagnostic needs either reuse + filter, or new bank |
| Topic / unit performance | NONE | — | Must calculate from answers (deterministic) |
| Study-plan link | `planner_goals`, `study_day` (via economy-phase-c/pages) | user, day, goal, lesson_ref | Integration point only; no direct diagnostic→goal link exists |

---

## 3. EXISTING CURRICULUM MAPPING (Taxonomy Audit)

```
Subject  ← exists (subjects / profiles.subject / community.subject / gamification.subject / pages.subject / past_exams.subject)
  ↓
Unit    ← exists only in community_quiz_scores (text, not normalized)
  ↓
Chapter ← exists in pages / economy-phase-c / worship / past_exams (only via academic_year, not as sub-unit)
  ↓
Lesson  ← exists only in ai_memories / exam-plan-days (not normalized taxonomy)
  ↓
Topic   ← exists in gamification / ai_memories / economy-phase-c / past_exams (no sub-structure)
```

**No normalized hierarchy anywhere.** The closest reusable taxonomy is `past_exams` (country→curriculum→subject→academic_year) + `profiles.subject`.

**Design implication:** Diagnostic can ask user `subject` (from profile or chooser) → `unit` (free text or link to `subject`) → generate 10–15 questions. Weak-topic detection operates at `subject` + `topic` granularity (what exists), not at full chapter/lesson trace. Study-plan integration uses `planner_goal` / `study_day` / `materials` (existing) rather than new lesson→topic links.

---

## 4. EXISTING STUDY PLAN INTEGRATION POINTS

Tables / concepts present:

- `planner_goals` (`pages.sql`) — study goals (not linked to diagnostic result).
- `study_day` / `study_config` (`economy-phase-c.sql`, `gamification.sql`, `exam-plans.sql`) — daily study structure.
- `materials` (`pages.sql`) — learning content; has `subject`/`chapter`.
- `exam_plan_days` (`exam-plans.sql`) — exam-day mapping to `subject`.
- `current_day` / `step` logic (`lib/pages-data`, `lib/magicly-ai`) — planner/state tracking.

**Integration design (minimal intervention):**
- Diagnostic result writes `weak_subjects` / `weak_units` / `strong_subjects` (calculated, not stored as new table if avoided — can be session-only or cached).
- Recommendation queries existing `materials` / `planner_goals` / `exam_plan_days` by `subject` + `topic` (text match, not FK — lower fidelity, zero new schema for MVP).
- Study-plan prioritization (future): add a `diagnostic_recommendation` note to `planner_goals` or `study_day` — not required for MVP; design keeps it external.

**Rule: DO NOT modify study plan now.** Design specifies integration points only.

---

## 5. EXISTING AI QUIZ INFRASTRUCTURE — DESIGN RULE

From audit:
- AI generates questions (`quiz_generator` agent + `unified-ai/route` / `ai/route`).
- AI does NOT persist correct answers independently of generation.
- AI is configured to "only from provided context / lesson data" — but no validation layer proves truth.

**Design decision (explicit, per instruction):**

```
Scoring truth  → deterministic (verified answer key)
Question source → verified bank (existing past_exam_questions) OR deterministic curated set
AI role        → optional: recommendation explanation / study-plan text (after MVP)
AI not used    → for scoring, for weak-topic calculation, for question validation in MVP
```

This avoids the risk: "AI opinion = scoring truth."

---

## 6. REUSABLE COMPONENTS (Verified)

| Component / Pattern | Location | Reuse for Diagnostic |
|---|---|---|
| Phase state machine (loading/intro/quiz/result/error) | `CommunityQuiz.tsx` (lines 44, 46) | **Yes** — copy pattern, adapt to diagnostic flow |
| Progress indicator (current/total) | `CommunityQuiz.tsx` | **Yes** |
| Submit + result screen with score/accuracy | `CommunityQuiz.tsx` + `QuizResult` interface | **Yes** |
| Anti-duplicate submit guard | `submittedRef` | **Yes** — essential for diagnostic (prevent score manipulation) |
| `createClient()` Supabase session | Many components | **Yes** |
| `motion` / `AnimatePresence` transitions | `CommunityQuiz.tsx`, `app/assessment/page.tsx` | **Yes** (UI polish, optional) |
| `QuizQuestion` interface (question + options + correctIndex) | `CommunityQuiz.tsx` (line 38) | **Yes** — but `correctIndex` must come from verified key, not AI per session |

**Not reusable for scoring:** Any AI-only generation path; any client-side score computation without server verification.

---

## 7. GAPS (Explicit — Nothing Invented)

| # | Gap | Evidence | Impact on Design |
|---|---|---|---|
| G1 | **No per-attempt question-answer table** | Only `past_exam_answers` (banked exams) exists; `break_quiz_sessions` is riddles; `community_quiz_scores` is weekly best. | Diagnostic needs attempt-level storage (questions selected + answers + correctness + timestamp) — either new minimal table or session-only for MVP |
| G2 | **No unified `unit/chapter/lesson/topic` taxonomy** | Confirmed by filewalk of 7 SQL files + profiles. | Weak-topic detection limited to `subject`/`topic` (what exists); full trace deferred |
| G3 | **No diagnostic-specific page/route** | Only `app/assessment/` (placement) exists. | New page required (design only — not implemented) |
| G4 | **No verified diagnostic question bank** | `past_exam_questions` exists but is exam-bank; not filtered for diagnostic; AI generates per session. | Questions must come from verified source (bank subset) or curated set; AI not source of truth |
| G5 | **No weak-topic calculation / result entity** | No `topic_performance`, `weak_topics`, `diagnostic_result` anywhere. | Weak topics computed deterministically from answers (no AI opinion needed) |
| G6 | **No recommendation routing table** | `materials`, `planner_goals` exist but are not linked to diagnostic. | Recommendation queries existing content by text match (lower fidelity, zero schema) |
| G7 | **Profile has no academic context beyond `subject`** | `profiles` = persona + subject (text); no grade/stage/track/curriculum/academic_year. | Design reads `profiles.subject` + optional user selection; no new profile fields |
| G8 | **No difficulty metadata on questions** | `past_exam_questions` has difficulty? Not verified in audit; no `difficulty` column confirmed. | Difficulty distribution (easy/medium/hard) requires either metadata or design-level approximation (not implemented) |
| G9 | **No rate limit specific to diagnostic** | Rate limits exist (`economy-phase-bc-rate-limits.sql`) for AI / community; no diagnostic rate limit defined. | If diagnostic uses AI later, apply existing rate limit; MVP uses no AI → no rate-limit change needed |

---

## 8. PROPOSED UX FLOW (Design — Not Implemented)

```
User (student / student-ready profile)
  ↓
[Optional] Confirm Subject (from profiles.subject or chooser)
  ↓
Choose Scope (Subject / Unit / Chapter — text choice; no new taxonomy required)
  ↓
Diagnostic Quiz (10–15 questions, verified answers, deterministic)
  ↓
Submit → Server computes score / per-topic accuracy / weak topics (deterministic)
  ↓
Result Screen
    → Overall score / accuracy (correct / total)
    → Strong topics (topic accuracy ≥ threshold)
    → Weak topics (topic accuracy < threshold)
    → Recommended study (links to existing materials / planner_goals by subject/topic text)
  ↓
[Future] Study-plan integration: add recommendation to planner_goals / study_day (not in MVP)
```

**States (from CommunityQuiz + Assessment):** Loading → Ready / Empty → In Progress → Submitted → Result → Error → Retry.

**Mobile / RTL / Accessibility:** Use existing theme tokens (`var(--foreground)`, etc.); RTL inherited from app layout; accessibility via semantic labels + keyboard navigation (standard Next patterns). No new theme work.

---

## 9. PROPOSED DATA FLOW (Design — No Tables Created)

```
User selects subject/scope
  → Client: load verified questions (from existing verified source or curated subset — NOT AI-generated for scoring truth)
  → Client: render 10–15 Q (MCQ with 4 options + explanation optional)
  → Client: collect answers (selected option index per question)
  → Client: submit answers to server endpoint (new route — design only)
  → Server: compare against verified correct answers (deterministic)
  → Server: compute score, per-subject/per-topic accuracy
  → Server: identify weak topics (threshold-based, deterministic)
  → Server: return result + recommendations (optional AI text for explanation — after MVP)
  → Client: display result (reuse CommunityQuiz result UI pattern)
  → [Optional / future] Server writes attempt record to new minimal table OR session-only
```

**Security (design, not implemented):**
- User can only read/write their own attempts (`user_id = auth.uid()`).
- User cannot modify `correct_answer`, `score`, `topic_accuracy` — server is source of truth.
- User cannot spoof completion — server writes attempt record; client only reads.
- Double-submit prevented by server idempotency key or session tracking.

---

## 10. QUESTION SELECTION STRATEGY (Design Decision)

Priority (per instruction — verified > AI):

1. **Verified bank subset** — filter `past_exam_questions` by `subject` + `curriculum` + `academic_year` (exists, verified answers, existing taxonomy). **Gap:** may not cover all diagnostic topics; difficulty metadata unverified.
2. **Curated diagnostic set** — curated by content team / admin (new, but minimal; can live in SQL insert or static JSON — design only, not created).
3. **AI-generated (optional, NOT scoring truth)** — can generate explanation text, recommendation copy, or supplementary questions for practice (post-MVP, with rate limit, never scoring source).

**For MVP design:** Select from verified source (past_exam_questions filtered) OR a minimal curated set (10–15 per subject/unit). No AI required for question source.

---

## 11. SCORING STRATEGY (Deterministic Design)

```text
Per question: correct (1) / incorrect (0)
Overall:   correct / total → accuracy %
Per topic: correct / total within topic → accuracy %
Per unit:  (if taxonomy exists) correct / total within unit → accuracy %
```

**Thresholds (design only, no existing data):**
- **Strong:** accuracy ≥ 80% (design decision; adjustable)
- **Needs Practice:** 50% ≤ accuracy < 80%
- **Weak:** accuracy < 50%

**Source of truth:** Server computes from stored correct answers (verified key) + user's answers — never from AI opinion, never from client-side calculation alone.

---

## 12. WEAK TOPIC DETECTION (Deterministic)

```text
Question → Topic (from verified key / taxonomy mapping)
    ↓
Correct / Wrong per question (server computed)
    ↓
Aggregate by Topic → Topic Accuracy
    ↓
Compare vs threshold → Weak Topic flag
```

**No AI involvement required.** If topic taxonomy is only text (no normalized table), detection operates on text-match grouping (lower fidelity — acceptable for MVP).

---

## 13. RECOMMENDATION STRATEGY (Design — No New Content Created)

```text
Weak Topic → Search existing content by text match:
    • materials (subject + chapter)
    • planner_goals (subject / goal text)
    • exam_plan_days (subject + day)
    • ai_memories (subject + topic + lesson — minimal)
  ↓
Return: "Start: [existing lesson/material name]" (text recommendation, not new content)
```

**No new lessons, materials, or content tables required.** Uses existing database.

---

## 14. STUDY PLAN INTEGRATION (Design — Minimal, No Changes to Study Plan)

Future integration points (NOT implemented now):
- Add a `diagnostic_recommendation` note to `planner_goals` or `study_day` (new column / new row — deferred).
- Prioritize `study_day` by weak-topic score (algorithm on existing tables — deferred).
- Link `exam_plan_days` to weak subjects for exam prep — deferred.

**MVP design:** Study-plan integration is out of scope; diagnostic produces a standalone result that a user can act on manually using existing study-plan UI.

---

## 15. SECURITY DESIGN (Not Implemented — Design Only)

| Threat | Mitigation (design) | Implementation (deferred) |
|---|---|---|
| Client modifies score | Server computes score from answers + verified key; client only sends answers; server writes result | New server endpoint (design only) |
| Client grants itself completion | Completion only after server writes attempt record; no client-side status flag | New table / server logic (deferred) |
| Read other user's results | RLS `user_id = auth.uid()`; server-role mutations only where needed | New table RLS (deferred) |
| Rapid repeated submissions | Rate limit (existing system or new per-endpoint); server idempotency key | Use existing rate limits; new endpoint rate limit deferred |
| Fake answers / answer key leak | Answer key not sent to client; server compares; if bank used, access control on bank | Access control on `past_exam_questions` (existing); new endpoint access (deferred) |

---

## 16. RATE LIMIT CONSIDERATIONS

- MVP: **No AI used** for diagnostic → no AI rate-limit consumption.
- If AI used later (explanation / recommendation copy): apply existing rate limits (`economy-phase-bc-rate-limits.sql`; `lib/ai/agents/rate-limit.ts`).
- If new endpoint: add to existing rate-limit framework (not invent new framework).

---

## 17. ECONOMY / XP / COINS (Design — Deferred Per Instruction)

Audit of `db/economy-phase-*.sql` + `db/shop.sql`: reward system exists (`coin_wallets`, `coin_ledger`, `daily_mission_claims`, XP tracking via `gamification` / `community_quiz_scores`).

**Design decision:** Diagnostic does NOT include reward for MVP. If added later:
- Connect to existing `coin_ledger` / `daily_mission_claims` (not bypass).
- Use `submit_quiz_result`-style RPC (server computes reward, writes ledger).
- No new economy schema needed.

**Status:** Deferred. Not part of Phase 1.2 MVP design.

---

## 18. MOBILE / RTL / ACCESSIBILITY (Inherited — No Design Changes)

- Layout uses existing responsive Tailwind patterns.
- RTL inherited from `app/layout` / theme / `dir="rtl"` setup.
- Accessibility: semantic HTML (`main`, `article`, `button` with `aria-label`), keyboard navigation, focus-visible styles (existing theme tokens).
- No new accessibility patterns required; reuse CommunityQuiz/Assessment patterns.

---

## 19. EDGE CASES (Design — Not Implemented)

| Case | Design Handling |
|---|---|
| User refreshes mid-quiz | State lost (not saved to DB / server for MVP); user restarts. Session storage optional (deferred). |
| User closes page / network fails | Same — restart from beginning. No resume designed for MVP. |
| No questions available for selected subject | Show "empty" state; prompt user to select different subject / unit. |
| All answers correct | Strong on all topics; recommendation = continue / advanced topic. |
| Zero questions answered | Block submit; show error; require at least one answer. |
| Duplicate submission | Server idempotency / attempt record prevents double-counting (design; deferred implementation). |
| User selects invalid / missing subject | Use profile `subject` as default; allow chooser. |
| User is not student (`grad`/`freelancer`) | Design supports all roles (`profiles.persona`); diagnostic content may vary; no separate flow required for MVP. |

---

## 20. MINIMAL IMPLEMENTATION PLAN (Design — Awaiting Approval)

If design approved, proposed phases (minimum viable, no unnecessary steps):

```
Phase 1.2A — Foundation / Design Lock (this doc)
  • Confirm reuse choices; approve tables / routes / UI
  • Verify no source-file changes (done above)

Phase 1.2B — Question Source (reuse existing)
  • Filter / select from past_exam_questions (verified) OR curate minimal set
  • NO AI generation for scoring truth
  • Confirm correct answers are verified

Phase 1.2C — Diagnostic UI (new page, reuse component patterns)
  • Create app/diagnostic/ (page + layout — design only; implemented only after approval)
  • Reuse CommunityQuiz state machine; adapt for diagnostic flow (subject chooser → quiz → result)
  • No new theme / accessibility work (use existing)

Phase 1.2D — Server Endpoint / Scoring (new API — design only)
  • New route (e.g., app/api/diagnostic/submit/route.ts) — NOT created now
  • Deterministic scoring: compare answers to verified correct keys
  • Per-topic / per-unit accuracy calculation
  • Weak-topic identification (threshold-based)
  • Server writes attempt record (if new table approved) or returns session result

Phase 1.2E — Weak Topic Detection + Recommendation (design only)
  • Calculate from server results (no AI opinion for weak-topic flag)
  • Recommendation query: existing materials / planner_goals / exam_plan_days (text match)
  • Optional AI explanation (post-MVP, not required)

Phase 1.2F — Study Plan Integration (deferred — design only; NO study plan changes)
  • Design points only; implement only when user approves separately

Phase 1.2G — Testing / Verification (after implementation)
  • `npx tsc --noEmit`; `npm run build`; RLS verify; duplicate-submit test; weak-topic accuracy check
```

**Note:** If audit reveals some steps unnecessary (e.g., if existing `past_exam_questions` fully covers questions + verified answers), Phase 1.2B can skip curation. If user wants no persistence (session-only diagnostic), Phase 1.2D can skip table creation. Design remains adaptable.

---

## 21. FILES EXPECTED TO CHANGE (If Implementation Approved — NOT NOW)

**New (only if approved after this design is reviewed):**
```
app/diagnostic/page.tsx          (new — diagnostic landing / subject chooser / quiz / result)
app/diagnostic/layout.tsx        (new — page shell)
app/api/diagnostic/submit/route.ts (new — server endpoint; deterministic scoring + result)
# Optional, deferred:
# db/diagnostic-schema.sql         (only if new table required — currently design says: evaluate if session-only is enough)
# components/DiagnosticQuiz.tsx   (new — if CommunityQuiz not fully reusable)
```

**Modified (only if approved, and only minimal):**
```
# None required for MVP if session-only; if persistence needed:
# db/ (new SQL only — not modified existing; add new table if needed)
# app/dr/ (existing routes — no change unless rate limit added to new endpoint)
```

**Files that must NOT change (standing rules):**
- `proxy.ts`, `db/auth-phase1.sql` (auth — Phase 1 completed)
- `db/past-exams-bank-foundation.sql` (no schema change — design links to it, does not modify)
- Any economy / shop / gamification SQL (no reward changes — deferred)
- `lib/ai/agents/quiz-generator.ts` (no AI source change — design explicitly avoids AI for scoring)
- Any study-plan SQL / pages / planner files (no modifications — design points only)
- No `as any` / hidden changes to existing files

---

## 22. FILES THAT MUST NOT CHANGE (Explicit — Verified)

All source/DB/API files audited above remain unmodified except the design doc (`PHASE_1_2_QUIZ_DIAGNOSTIC_AUDIT_DESIGN.md`). Confirmed by:

```bash
git status --short  # only new .md + existing Phase 1.1 audit files; no .ts/.tsx/.sql source changes
git diff --name-only  # excludes source
```

Baseline build (`npm run build`) confirms no source files affected.

---

## 23. REUSE SUMMARY — FIRST PRINCIPLE APPLIED

| Needed Capability | Existing Source | Decision |
|---|---|---|
| Quiz UI / state machine | `components/CommunityQuiz.tsx`, `app/assessment/page.tsx` | **Reuse pattern** |
| Answer / attempt storage pattern | `db/community.sql` (`community_quiz_scores`), `db/gamification.sql` | **Reuse concept**; new per-attempt table deferred / optional |
| Verified question bank | `db/past_exams-bank-foundation.sql` (`past_exam_questions`) | **Reuse / link** (filter by subject/curriculum/academic_year) |
| Scoring (deterministic) | `CommunityQuiz` server logic (concept) + design | **New endpoint** (design only) — server-side deterministic comparison |
| Weak-topic calculation | NONE existing | **Design new calculation** (deterministic aggregation — no AI) |
| Recommendation / study link | `materials`, `planner_goals`, `exam_plan_days`, `pages` | **Reuse by text query** (no schema change) |
| AI explanation / recommendation | `quiz-generator` agent + `unified-ai` routes | **Optional / deferred** — never scoring truth |
| Profile / academic context | `profiles` (persona + subject) + `past_exams` taxonomy | **Reuse** — read `profiles.subject`; link to exam taxonomy |

**No new quiz system, assessment system, scoring system, weak-topics system, or AI generator created** — only design of integration with existing.

---

## 24. RISKS (Design — Not Implementation Risks Yet)

| Risk | Mitigation (design) |
|---|---|
| No unified taxonomy limits weak-topic precision | Accept for MVP; operate at `subject`/`topic` (exists); full hierarchy deferred |
| Verified question bank may not cover all diagnostic needs | Allow curated supplement (design only); AI not scoring truth |
| Existing AI quiz infrastructure may be misused as scoring source | Explicit design rule: AI = explanation/recommendation only; scoring = deterministic server |
| User profile lacks full academic context | Design reads `profiles.subject`; allows chooser; no new profile fields |
| Session-only vs persistence dispute | Design allows both; persistence (table) only if user approves after design review |
| Rate limit / economy interaction if AI used later | Apply existing rate limits; defer economy rewards |
| Study-plan integration scope creep | Explicit: no study-plan changes in this phase; integration points specified, not implemented |

---

## 25. DEFINITION OF DONE (For Design Phase — This Document)

- [x] Full repo audit of assessment/quiz/question/score/attempt/answer/topic/unit/chapter/weak/strength/diagnostic/generator/bank/pass-exam completed.
- [x] Existing infrastructure (assessment page, CommunityQuiz, quiz-generator agent, DB schemas, taxonomy, study-plan, profile, AI routes, economy, rate limits) verified and documented.
- [x] REUSE-first analysis completed — no new systems proposed where existing ones work.
- [x] Gaps explicitly listed (G1–G9) — nothing hidden.
- [x] Proposed architecture (UX flow, data flow, question selection, scoring, weak-topic detection, recommendation, security, rate limits, economy, mobile/RTL/access) documented.
- [x] AI usage explicitly defined (MVP: none for scoring; optional for explanation only — not source of truth).
- [x] Security design documented (user-only access; server source of truth; anti-manipulation).
- [x] Study-plan integration points identified — explicit that NO study-plan modifications now.
- [x] Implementation phases proposed (minimum; adaptable) — 1.2A through 1.2G; some optional.
- [x] Expected / must-not-change files listed.
- [x] TypeScript baseline verified (`npx tsc --noEmit` PASS); build verified (`npm run build` PASS); NO source files modified.
- [x] Design document written (`PHASE_1_2_QUIZ_DIAGNOSTIC_AUDIT_DESIGN.md`).
- [x] Implementation STOP — await user approval.

---

## 26. FINAL REPORT — SUMMARY (As Requested in Task)

```
=== PHASE 1.2 AUDIT + DESIGN ===

Existing Quiz System:
  • app/assessment/page.tsx — static 3-Q placement quiz (no DB persistence; UI reusable)
  • components/CommunityQuiz.tsx — AI-generated 10-Q weekly quiz (component state machine reusable; AI question source NOT deterministic scoring truth; server score/accuracy via community_quiz_scores)
  • lib/ai/agents/quiz-generator.ts — AI content generator only; no persistence; not a scoring source
  • Database: no unified diagnostic attempt/answer/result table; closest patterns = community_quiz_scores (weekly best) + gamification quiz session concepts + past_exam_questions (verified bank)

Existing Assessment:
  • Only placement quiz (assessment/); no diagnostic pages; no assessment-specific DB schema
  • Conceptual overlap: quiz/attempt/answer/score exist in gamification + community + break-zone but not unified for academic diagnostic

Reusable Components:
  • CommunityQuiz state machine, QuizResult interface, submit flow, anti-duplicate guard → YES
  • Assessment page phases → YES (UI only)
  • createClient / motion / theme → YES (inherited)
  • QuizGenerator agent → NO for scoring; optional for explanation (post-MVP)

Reusable DB:
  • past_exams-bank-foundation (subjects/curricula/academic_years/past_exam_questions/past_exam_answers/countries) → YES for question bank link
  • community_quiz_scores (user/subject/week/score/accuracy/attempts + RLS + RPC) → YES as scoring pattern
  • profile-persona (persona + subject) → YES for user context
  • planner_goals / study_day / materials / exam_plan_days / pages → YES for recommendation/integration points (text-query, no schema change)
  • No unified taxonomy (unit/chapter/lesson/topic) → GAP (G2)

Existing Curriculum Mapping:
  • Subject: yes (subjects / profiles.subject / community.subject / gamification.subject / pages.subject / past_exams.subject)
  • Unit: partial (community.subject only — not normalized)
  • Chapter: partial (pages / economy-c / worship / past_exams via academic_year — not normalized sub-unit)
  • Lesson: minimal (ai_memories / exam-plan-days)
  • Topic: partial (gamification / ai_memories / economy-c — not normalized under unit/chapter)
  → No unified hierarchy exists; design operates at available granularity

Existing Study Plan Integration:
  • planner_goals / study_day / exam_plan_days / materials present
  • No direct link to diagnostic results exists
  → Design specifies integration points; NO study-plan modifications in this phase

Existing AI Quiz:
  • quiz-generator agent + unified-ai/ai/chat routes generate questions from lesson context
  • No independent validation layer; AI is content generator, not truth source
  → Design: AI NOT used for scoring / weak-topic calculation / validation in MVP; optional explanation only

Missing Pieces (Gaps G1–G9):
  G1 — per-attempt question-answer table (none exists; community is weekly-best)
  G2 — unified taxonomy (subject→unit→chapter→lesson→topic; none exists)
  G3 — diagnostic page/route (only assessment/ placement exists)
  G4 — verified diagnostic question bank (past_exam_questions linkable but not filtered for diagnostic; AI not verified)
  G5 — weak-topic/result entity (none)
  G6 — recommendation routing (exists by text query; no direct link)
  G7 — full academic profile (only persona + subject on profiles)
  G8 — difficulty metadata (unverified)
  G9 — diagnostic rate limit (none; apply existing if AI used later)

Recommended Architecture:
  • UX: Subject/unit chooser → 10–15 Q diagnostic → Submit → Server deterministic scoring → Result (strong/weak + recommendations via existing content) → Study integration (future, separate approval)
  • Data: Verified answers (past_exam_questions or curated set) → User answers submitted → Server computes score/per-topic accuracy/weak topics (deterministic) → Result returned (session or persisted per approval)
  • AI role: None for MVP scoring; optional explanation/recommendation copy after MVP
  • Security: User-only access; server source of truth; no client-side score manipulation

Recommended Data Model (minimum, deferred unless user approves persistence):
  If session-only (MVP): NO new tables; answers and results computed server-side per session, not persisted.
  If persistence approved: minimal new table (user_id, attempt_id, question_refs, answers, correct_flags, score, topic_accuracy, timestamp) with RLS; relationships to existing users/subjects; indexes on (user_id, timestamp); constraints (user cannot modify score/correct).
  No modification to existing past_exams / community / profile / study-plan schemas.

Recommended UX:
  • Phase: Loading → Ready/Empty → In Progress → Submitted → Result → Error → Retry
  • States: Mobile/desktop/RTL/accessibility (inherited)
  • Resume: Not designed for MVP (state lost on refresh — acceptable per design; can add session storage later)
  • Anti-abuse: Server-side score computation + idempotency + rate limits (existing framework)

Question Strategy:
  • Verified bank (past_exam_questions filtered) OR curated set — NOT AI-generated for scoring truth
  • 10–15 questions per session; difficulty distribution if metadata available (otherwise approximate at design level)
  • Explanation per question — optional (from verified key or AI after MVP)

Scoring:
  • Deterministic: correct/total; topic accuracy = correct/total per topic; unit accuracy = correct/total per unit (if taxonomy exists)
  • Source of truth: server (verified correct answers vs user answers)
  • Thresholds: Strong ≥80%, Needs Practice 50–80%, Weak <50% (design only; adjustable)

Weak Topic Detection:
  • Aggregate correct/incorrect by topic (from verified question mapping)
  • Compare to threshold → Weak flag (deterministic)
  • No AI opinion involved

Study Plan Integration:
  • Design points: weak topics → query existing materials/planner_goals/exam_plan_days by text match → recommendation
  • NO study-plan modifications in this phase; deferred to separate approval

AI Required for MVP: NO (scoring, weak-topic, recommendation all deterministic; AI optional for explanation only, deferred)
New Tables Required: NO for MVP session-only; YES (minimal attempt table) only if user approves persistence after design review
New API Required: YES (new diagnostic submit endpoint — design only; not created now)

Files Expected to Change (only if approved after this design review):
  NEW: app/diagnostic/page.tsx, app/diagnostic/layout.tsx, app/api/diagnostic/submit/route.ts (optional: db/diagnostic-schema.sql; components/DiagnosticQuiz.tsx if CommunityQuiz not fully reusable)
  MODIFIED: none required for session-only; minimal SQL add only if persistence approved (no edits to existing SQL)
  MUST NOT CHANGE: proxy.ts, auth-phase1.sql, past-exams-bank-foundation.sql, quiz-generator.ts, economy/shop/gamification SQL, study-plan SQL/pages, any source with `as any` / hidden changes

Risks:
  • Taxonomy gap limits precision (mitigated: operate at existing granularity)
  • Verified bank coverage (mitigated: allow curated supplement; no AI for truth)
  • AI misused as scoring source (mitigated: explicit design rule; server deterministic)
  • Profile context limited (mitigated: chooser + subject read; no new fields)
  • Session vs persistence (mitigated: design allows both; persistence deferred until approval)

TypeScript: PASS (npx tsc --noEmit — no source changes, baseline verified)
Build: PASS (npm run build — no source changes, baseline verified)

Implementation Phases (minimum, adaptable; some optional):
  1.2A — Design Lock (this doc — complete)
  2.2B — Question Source (reuse verified bank / curated — deferred)
  2.2C — Diagnostic UI (new page — deferred until design approved)
  2.2D — Server Endpoint / Scoring (new API — deferred)
  2.2E — Weak Topic + Recommendation (design — deferred)
  2.2F — Study Plan Integration (explicitly deferred — separate approval)
  2.2G — Testing (after any implementation)

Status: AUDIT + DESIGN COMPLETE — STOP. Await user approval before any implementation.
No code, DB, UI, or file changes made beyond this design document.
```

---

**Verification of "No Implementation" (re-confirmed):**
- `git status`: only this new `.md` file + Phase 1.1 audit artifacts; no `.ts`/`.tsx`/`.sql` source modifications.
- `npm run build`: PASS (no change to build artifacts from source edits — only design doc added, not compiled).
- `npx tsc --noEmit`: PASS.
- No `app/diagnostic/` created; no `app/api/diagnostic/` created; no DB tables added; no UI edited; no AI router changed; no rate limits changed; no economy changed; no study-plan edited.

---

*Document: `PHASE_1_2_QUIZ_DIAGNOSTIC_AUDIT_DESIGN.md` — created 2026-09-03 (Phase 1.2). Design only. No implementation. Awaiting approval.*
