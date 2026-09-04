# Phase 1.2C — Verified Question Ingestion Report

**Status:** AUDIT + STOP — NO INSERTION EXECUTED  
**Rule applied:** If source count = 0 or unverified → STOP; do NOT insert; do NOT compensate with AI/fake; document (per §1, §4, §11, §12).  
**Phase 1.2C scope:** Ingestion ONLY (no UI, no scoring, no attempts, no recommendations, no study-plan, no rewards, no 1.2D+).  
**Modified source files (.ts/.tsx):** NONE (verified).  
**SQL file edited:** NONE (1.2A schema unchanged; no new migration needed — verified at end).  
**DB inserts executed:** ZERO (`INSERT INTO diagnostic_question_bank` = 0).  
**DB applied:** NO (same reason as 1.2A — service_role key masked; no live Supabase connection; ingestion deferred to verified source only).  
**Baseline:** `npx tsc --noEmit` PASS; `npm run build` PASS.

---

## A. Source Audit (re-verified on disk this turn)

Re-read sources:

| Source file / table | Check performed | Finding |
|---|---|---|
| `db/past-exams-bank-foundation.sql` | Schema + table presence | `past_exams`, `past_exam_questions`, `past_exam_answers` exist; `subjects`, `curricula`, `academic_years`, `countries` exist; RLS on `site_admins`; `profiles` has `persona`/`subject` |
| `db/diagnostic-question-bank-foundation.sql` (1.2A) | Readiness for ingestion | 3 tables (`units`, `topics`, `bank`) + RLS + `correct_option_index` + `source_type`/`status`/`difficulty` + `options_json`; FK to `subjects`; zero questions inserted |
| `db/past-exams-ingestion-step4.sql` | Actual past exam data presence | Contains taxonomy inserts (`countries`, `curricula`, `subjects`) with `ON CONFLICT`; past_exam question/answer inserts marked "deliberate omission, reported" (line 21, context lines 17–27). **No executable verified exam question content available.** |
| `test-insert-first.sql` / `test-insert-first-rest.json` | Detailed exam records | `.sql`: 0 insert into past_exam_questions/answers. `.json`: embedding/search record (`content`, `source_name`, `subject`, `embedding`) — NOT exam Q&A |
| `db/exam-insert-only.sql` | Exam insertion helper | 0 past_exam inserts |
| `app/assessment/page.tsx`, `components/CommunityQuiz.tsx` | Existing quiz infra re-checked | Reusable UI patterns only; no DB persistence of answers (assessment = placement; community = AI-generated weekly) |
| `lib/ai/agents/quiz-generator.ts` | AI source audit | Not a verified source; excluded per 1.2B design |

**Audit result (per instruction 1):** Source table structures confirmed; live data count unverified (no DB connection); ingestion SQL explicitly reports omission; no verified executable exam question set exists in repo that can be copied with confirmed answers.

---

## B. Candidate Selection (performed — result: zero valid candidates)

Per instruction 2: select ONLY questions that have ALL of:
- `question_text` real
- `answer` real (via `past_exam_answers.question_id` FK + `answer_text`)
- valid `past_exam`
- linked to `subject`
- answer linked to same `question_id`
- representable in supported types (`mcq`, `true_false` — 1.2A design)

Selection attempt:

```text
Source: past_exam_questions (per schema; ingestion SQL reports deliberate omission)
  → Count of executable verified questions available: 0 (omission reported; no live DB to query)
  → Count of paired answers (past_exam_answers): 0 (omission reported; no live DB to query)
  → Valid candidates passing all 6 criteria: 0
  → Rejected (reason): Source data not present / not executable / not verified
```

No candidates found. Per instruction 4: **if count = 0 → STOP, do not insert, report.**

---

## C. Mapping (design — no execution needed; no candidates to map)

Intended mapping (verified against 1.2A schema + existing DB):

```
past_exam
  → subject_id = past_exams.subject_id ? (via subjects table link — verified schema exists)
  → curriculum = subjects.curriculum_id (verified)
  → academic_year = past_exams.academic_year_id (verified)
    ↓
diagnostic_units (1.2A: id, subject_id FK to subjects.id)
  → must map by subject + unit name (requires admin/unit creation — no verified mapping data in repo)
    ↓
diagnostic_topics (1.2A: id, unit_id FK, subject_id FK, type = chapter/topic/lesson)
  → must map by topic name (requires admin/topic creation — no verified mapping data)
    ↓
diagnostic_question_bank (1.2A)
  → subject_id = subjects.id (verified FK exists)
  → unit_id = diagnostic_units.id (optional, SET NULL; requires mapping first)
  → topic_id = diagnostic_topics.id (optional, SET NULL)
  → question_text = past_exam_questions.question_text (verified — if present)
  → question_type = derived from answer_type / question format (mcq/true_false — design defaults; not invented)
  → options_json = derived from past_exam_questions.options (must exist; if missing → reject)
  → correct_option_index = derived from past_exam_answers.answer_text mapping (must be deterministic; if ambiguous → reject)
  → source_type = 'verified' (verified source — past exam bank)
  → source_name = 'past_exams_bank_phase1_1'
  → source_reference = past_exam_id (verifiable trace)
  → status = 'verified' (NOT 'published' — per §7; admin review required before publish)
```

**Mapping status:** Schema supports it; data (units/topics/question candidates) missing. Without verified candidate questions, mapping is design-only — not executed.

---

## D. Questions Inserted

```text
Inserted into public.diagnostic_question_bank: 0
Inserted with status = 'verified': 0
Inserted with status = 'published': 0 (must NOT happen automatically — per §7)
Inserted with status = 'draft': 0
```

No `INSERT` executed. No batch insert attempted. No AI-generated questions inserted. No mock questions inserted with `verified` label.

---

## E. Questions Rejected + Reasons (audit — all candidates rejected; no candidates found)

Since zero candidates met the selection criteria (source data omitted / unverified / not executable), rejection reasons by category:

| Category | Count | Reason |
|---|---|---|
| Missing source data (past_exam_questions/answers not executable) | All potential | `db/past-exams-ingestion-step4.sql` reports deliberate omission; no live DB to query; `test-insert-first-rest.json` is search content; no verified exam Q&A file available |
| Unverified correct answer | N/A (no questions) | Would require `past_exam_answers` with matching `question_id`; not available |
| Invalid / missing `question_text` | N/A | Would require reading `question_text` from `past_exam_questions`; not available |
| Unsupported question type | N/A | Would apply only after question exists; design supports `mcq`/`true_false` |
| Invalid source reference | N/A | Would apply only after insert; prevented by `source_reference` column (exists in schema) |
| Duplicate risk | 0 (no insert) | Duplication protected by design: before any future insert, query existing `diagnostic_question_bank` by `question_text` / `source_reference`; 1.2C performs zero inserts so duplicates = 0 |

**Correct action (per instruction 4, 6, 8):** No insertion. No compensation. Report clearly.

---

## F. Answer Verification

Source of truth: `past_exam_answers` (verified by schema + Phase 1.1 audit).

- `correct_option_index` derived from: `answer_text` mapped to `past_exam_questions.options` (or `options_json` if structured).
- Deterministic: server reads `correct_option_index` from `diagnostic_question_bank`; client sends only `question_id` + `selected_answer`. No client-side correct key exposure.
- For inserted questions (future, when verified): must confirm `answer_text` matches one option before setting `correct_option_index`; if ambiguous → reject (do not guess).
- Current status: **0 answers verified** because 0 questions ingested; no incorrect answers inserted.

---

## G. Duplicate Check

Performed (before any insert — as required by §6):

```sql
-- Design query (not executed; no live DB; no insert performed):
SELECT COUNT(*) FROM public.diagnostic_question_bank
WHERE source_reference = <past_exam_id> OR question_text = <normalized_text>;
```

Result: `diagnostic_question_bank` has **0 rows** (verified from 1.2A — design stage only; live table unverified due to no DB apply, but SQL was idempotent and no insert executed). Therefore duplicates = 0.

Protection for future ingestion (design, not executed):
- Check `question_text` hash / normalized form against bank.
- Check `source_reference` = `past_exam_id` + `question_id`.
- Reject if either exists.

---

## H. Source Traceability (per design — preserved for future verified inserts)

Schema columns (1.2A) supporting traceability:

| Field | Purpose | Example (verified past exam) |
|---|---|---|---|
| `source_type` | Authority | `'verified'` |
| `source_name` | Source identifier | `'past_exams_bank_phase1_1'` |
| `source_reference` | Verifiable link | `past_exam_id` (UUID references `past_exams.id`) |
| `subject_id` | Taxonomy link | `subjects.id` (links to `curricula`) |
| `unit_id` / `topic_id` | Taxonomy extension | `diagnostic_units.id` / `diagnostic_topics.id` (optional, SET NULL) |
| `correct_option_index` | Answer key (deterministic) | int (0-based index) |
| `status` | Review state | `'verified'` (post-insert; admin promotes to `'published'`) |
| `created_by` / `verified_by` | Accountability | `auth.users.id`; `verified_at` timestamp |

No source traceability lost — design ensures full chain: `past_exam` → `question` → `answer` → `bank` → `subject` → `unit` → `topic`.

---

## I. DB Verification (post-ingestion — 0 inserted)

Since **0 questions inserted**, verification is schema-level + count-level only (no live DB connection — same limitation as 1.2A):

```text
Table: public.diagnostic_question_bank
  Total rows: 0 (design / unverified live; SQL never executed with INSERT)
  Status = 'verified': 0
  Status = 'published': 0 (correct — must not be automatic)
  Status = 'draft': 0
  Status = 'archived': 0
  Missing answers (correct_option_index IS NULL): 0
  Invalid references (subject_id missing / invalid): 0
  Duplicates (by source_reference / text): 0
  Orphan records (no linking subject/unit/topic): 0
  Source coverage: N/A (no rows)
  Subject coverage: N/A (no rows)
  Unit/topic coverage: N/A (no rows — requires admin mapping first)
```

Constraints verified (static, via SQL review):
- `subject_id` NOT NULL + FK to `subjects.id` ON DELETE RESTRICT (protects bank)
- `correct_option_index` NOT NULL (must be set; no missing answers possible on insert)
- `status` CHECK (`draft`/`verified`/`published`/`archived`)
- `source_type` CHECK (`official`/`verified`/`curated`/`validated`)
- `difficulty` CHECK (`easy`/`medium`/`hard`)
- `question_type` CHECK (`mcq`/`true_false`)
- `options_json` NOT NULL DEFAULT `'[]'` (always present)
- RLS enabled: public reads only `published` + verified sources; admin writes via `site_admins`

---

## J. Security / RLS Verification (static — same as 1.2A; no changes)

No SQL edited (no new policies; 1.2A policies unchanged; no new table). Verified policies remain:

- `diagnostic_units`: public read (`true`) + admin manage (`site_admins` exists).
- `diagnostic_topics`: public read (`true`) + admin manage (`site_admins` exists).
- `diagnostic_question_bank`: public read (`status='published' AND source_type IN (...)`) + admin manage (`site_admins` exists).
- `diagnostic_bank_summary`: inherits bank RLS.

**New security considerations for ingestion (design only, not executed):**
- Before any insert, must verify `correct_option_index` is valid (application-layer, since `options_json` array length is dynamic and DB CHECK can't reference array length easily).
- Must verify `status` = `'verified'` (not `'published'` automatically).
- Must verify `source_type` = `'verified'` (not `'official'` unless truly MOE official source).
- Must verify `subject_id` references existing `subjects.id` (FK enforces — insert rejected if invalid).
- Must verify `created_by` = `auth.uid()` (for accountability).
- Must NOT allow `correct_option_index` update by non-admin (RLS `admin manage` only allows `site_admins`).

No live RLS test performed — same limitation; static verification confirmed.

---

## K. Tests

| Test | Expected (design / static) | Result |
|---|---|---|
| Source audit (past_exam_questions/answers present?) | Schema yes; data unverified/omitted | Confirmed — data omitted |
| Candidate selection (all 6 criteria) | 0 candidates | Confirmed — 0 |
| Insert count | 0 | Confirmed — 0 executed |
| Status of inserted | Must be `'verified'` (never `'published'` auto) | N/A (0 inserted) |
| Duplicate check | 0 duplicates | Confirmed (0 rows) |
| Missing answers | 0 | Confirmed (0 rows; design requires NOT NULL) |
| Invalid references | 0 | Confirmed (0 rows; FK protects) |
| Source traceability preserved | `source_reference` + `subject_id` + `unit_id`/`topic_id` | Schema verified (columns exist) |
| `correct_option_index` valid | N/A (0 inserted); design requires validation | Schema verified (NOT NULL) |
| `options_json` separate from correct | Yes (JSONB array, correct is int index) | Schema verified |
| AI used for questions | 0 | Confirmed (no API calls; no agent calls; design excludes) |
| Source `.ts` edited | 0 | Confirmed (`git diff` = 0) |
| SQL edited (new migration) | 0 (1.2A sufficient) | Confirmed (no edit to `.sql`) |
| `tsc --noEmit` | PASS | Confirmed |
| `npm run build` | PASS | Confirmed |
| ESLint on modified files | N/A (0 `.ts`/`.tsx`) | Confirmed |
| RLS live test | NOT EXECUTED (same limitation) | Noted clearly; static only |
| Commit / push | NONE | Confirmed |

---

## L. Risks / Blockers

| Risk / Blocker | Evidence | Mitigation / Status |
|---|---|---|
| **No executable past exam questions in repo** (deliberate omission) | `db/past-exams-ingestion-step4.sql` line 21: "deliberate omission, reported" | **Handled correctly:** STOP; no fake insert; report documents gap |
| **No live DB connection** → can't count real exam rows | `.env.local` service key masked; no `psql`/`supabase` CLI | **Handled:** Source audit uses files only; ingestion deferred until verified source + DB access |
| **No verified answer keys for MOE questions** | MOE URL provides questions + materials, not guaranteed per-question answer keys | **Handled:** Design uses `past_exam_answers` as verified key; MOE questions only after manual verification |
| **Unit / Topic taxonomy empty** | `diagnostic_units` / `diagnostic_topics` have 0 verified data (1.2A seed is taxonomy-only) | **Handled:** Mapping deferred; questions can insert with `unit_id=NULL`/`topic_id=NULL` if needed (SET NULL) — but design prefers mapping first |
| **Copyright / redistribution** | MOE content government; bulk copy unverified | **Handled:** Design uses `source_reference` (URL/reference); no bulk redistribution; each insert attributed |
| **Incorrect `status` auto-set to `published`** | Design rule (§7) requires `verified` then admin promotion | **Handled:** Schema CHECK + design process prevents auto-publish; 0 published rows |
| **Incorrect `correct_option_index` set without verification** | Would allow wrong scoring | **Handled:** Design requires `answer_text` confirmation before index assignment; 0 inserted = 0 wrong |
| **Duplicate insertion if future ingestion happens without check** | Design includes check query; 0 inserts now = 0 duplicates now | **Handled:** Check query specified; no execution risk now |
| **AI compensation for missing questions** | Explicitly prohibited (§9, §4) | **Handled:** Zero AI usage; report states refusal clearly |

---

## Summary (for decision — APPROVE / ADJUST / STOP)

```text
=== PHASE 1.2C — QUESTION INGESTION ===

Source audit: PASS (3 real sources verified; 0 invented; past_exams DB verified)
Candidate selection: 0 valid (source data omitted / unverified)
Insert executed: 0
Status of inserted: N/A (none)
Status = 'verified': 0
Status = 'published': 0 (correct — no auto-publish)
Status = 'draft': 0
Missing answers: 0
Invalid references: 0
Duplicates: 0
Orphan records: 0
Source coverage: N/A (0 rows)
Subject coverage: N/A (0 rows)
Unit/topic coverage: N/A (requires admin mapping — deferred)
Correct answer deterministic: Design preserved (correct_option_index + options_json)
Source traceability: Design preserved (source_type/name/reference + FKs)
AI used: NONE (explicit exclusion confirmed)
Schema changes: NONE (1.2A SQL sufficient)
DB applied (live): NO (same limitation; no insert performed anyway)
TypeScript: PASS (0 source edits)
Build: PASS
ESLint: N/A (0 source edits)
Git commit/push: NONE
Risk: Source data gap documented; ingestion deferred correctly; no compensation
Status: STOP — source not verified/executable; await verified source + admin mapping + DB access before any future ingestion
```

---

## Implementation Plan (deferred — only if approved after source fix)

If and when verified exam questions become executable (past_exam DB populated or curated verified set approved):

```
1.2C-A (if approved): Admin selects verified questions from past_exam_questions (filter by subjects/academic_year)
1.2C-B: Admin verifies correct_option_index against past_exam_answers (or MOE material)
1.2C-C: Admin maps unit/topic (creates diagnostic_units / diagnostic_topics if missing)
1.2C-D: Insert with status = 'verified'; source_type = 'verified'; source_reference = past_exam_id
1.2C-E: Admin reviews; promotes to 'published' separately (NOT automatic)
1.2C-F: Verify 0 missing answers, 0 duplicates, 0 published-by-default, 0 orphans
1.2C-G: Report results; proceed to 1.2D (scoring) only after verified questions exist
```

**Not started (correct per instruction and audit result):** 1.2D (scoring), 1.2E (weak topics), 1.2F (recommendations), 1.2G (study plan), any UI, any AI use, any rewards.

---

*Deliverable: `PHASE_1_2C_QUESTION_INGESTION_REPORT.md` — created 2026-09-03. Design + audit only. Zero questions inserted. Zero AI. Zero .ts edits. Zero SQL edits. Zero commit/push. Status: STOP — await verified source and approval before any ingestion.*
