# Phase 1.2B — Verified Question Source & Bank Filter Report

**Status:** DESIGN ONLY — NO IMPLEMENTATION (no DB inserts, no UI, no scoring, no AI).  
**Branch:** main (from 1.2A)  
**Modified source files:** NONE (`git diff --name-only '*.ts' '*.tsx'` = 0).  
**New file only:** `PHASE_1_2B_QUESTION_SOURCE_REPORT.md`.  
**DB SQL changed:** NONE (1.2A SQL unchanged; no new schema needed — confirmed).  
**Baseline:** `npx tsc --noEmit` PASS; `npm run build` PASS.

---

## A. Sources Audited (verified against disk, not invented)

Audited files (re-read in this turn):

| File / Source | What was checked | Finding |
|---|---|---|
| `CONTENT_STRATEGY_STEP3.md` | Source/verified/exam references | Confirms `official`/`verified`/`past_exam` sources; no direct question-bank URL besides MOE |
| `STEP4_FIRST_INGESTION_REPORT.md` | Verified ingestion results | Only verified URL = `https://moe.gov.eg/ar/elearningenterypage/e-learning`; exam/past_exam sources used |
| `STEP4_2_CONTENT_VERIFICATION.md` | Content verification steps | Confirms `verified`/`official`/`exam`; MOE URL re-confirmed |
| `db/past-exams-bank-foundation.sql` | Existing verified bank | `past_exam_questions` (verified questions) + `past_exam_answers` (`question_id` FK, `answer_text`, `answer_type`) — verified answer keys exist |
| `db/diagnostic-question-bank-foundation.sql` (1.2A) | Schema readiness | 3 tables (`units`, `topics`, `bank`) + RLS + `correct_option_index` deterministic + controlled `source_type`/`status`/`difficulty`; zero questions inserted |
| `lib/auth-roles.ts` | Admin source | `site_admins` is real admin (not `profiles.role`) — uses `getAdminRole()` |
| `db/admin-roles.sql` | Admin RLS | Confirms `site_admins` table + server-only writes |

**No fabricated URLs, no invented PDFs, no AI-generated content inserted.**

---

## B. Exact Verified Sources (only these — nothing added)

### B1. MOE Egypt — Official (verified from reports + live web)

- **Source name:** Ministry of Education and Technical Education (Egypt) — E-Learning Platform
- **Exact URL:** `https://moe.gov.eg/ar/elearningenterypage/e-learning` (verified in both ingestion reports; also `https://moe.gov.eg/en/what-s-on/news/on-its-website` — announcement of educational materials)
- **Authority / type:** Government — Official (`official`)
- **What content is actually available:** Educational/training materials + "a large number of questions at the end of each study unit of the curriculum" (direct quote from MOE news announcement — questions vary by cognitive level: remembering/understanding/deep understanding). Content covers grades Primary → Secondary.
- **Can questions be verified?** YES — platform provides questions tied to curriculum units; answers expected via accompanying materials (not all have public answer keys on this page; answer verification requires supplemental source).
- **Answer key exists?** Partial — MOE provides questions + curriculum-linked explanations; full answer-key availability not confirmed from this URL alone. Phase 1.1 `past_exam_answers` serves as verified answer source for exam-derived questions.
- **Downloadable / linkable?** Platform is web-based; individual questions not directly downloadable as a bulk file from this URL. Content is browseable by subject/grade/unit.
- **Copyright / redistribution:** Government educational content — typically public for educational use within Egypt; redistribution outside Egypt / for commercial use requires verification. For diagnostic bank (internal to this project), linking/cache of verified questions for student study is within educational-use scope, but direct copy of full MOE content into DB requires legal confirmation (not done here — design only, no insert).
- **Suitable for Diagnostic Question Bank?** YES — primary source for verified Egypt Secondary Math questions; requires filtering by `subject`/`unit`/`topic` and pairing with `past_exam_answers` for deterministic scoring.

### B2. NIC / NIES — Official Standards (verified from live web + reports)

- **Source name:** National Education System (NIES) / NIC — Assessment & Examinations
- **Exact URL:** `https://nes.moe.gov.eg/NIES/Home/AssessmentExaminations`
- **Authority / type:** Official (`official`) — government assessment/examination board co-issued with Cambridge for Grade 9 (CNIPE)
- **What content is actually available:** Assessment standards, progression tests (Grade 4–8), CNIPE achievement tests (Grade 9), grading benchmarks — NOT individual practice questions
- **Can questions be verified?** Standards only — no direct question content available at this URL
- **Answer key exists?** Not applicable — standards document
- **Downloadable / linkable?** Web standards pages
- **Copyright / redistribution:** Government — educational
- **Suitable for Diagnostic?** YES for taxonomy/assessment framework; NO for direct question ingestion. Use for `curricula`/`subjects` mapping, not for bank content.

### B3. Phase 1.1 — Past Exams Bank (verified on disk)

- **Source name:** Project Phase 1.1 Past Exams Bank
- **Exact source:** `db/past-exams-bank-foundation.sql` (verified ingestion — `past_exam_ingestion_step4.sql` applied, content verified in `STEP4_2_CONTENT_VERIFICATION.md`)
- **Authority / type:** `verified` (based on actual past exam records ingested from real exam sources; answer keys present)
- **What content is actually available:** `past_exams`, `past_exam_questions`, `past_exam_answers`; links to `subjects`, `curricula`, `academic_years`, `countries`
- **Can questions be verified?** YES — `answer_text` stored; `question_id` FK to `past_exam_questions`
- **Answer key exists?** YES — `past_exam_answers` table is the verified key (`id`, `question_id`, `answer_text`, `answer_type`)
- **Downloadable / linkable?** Internal DB only
- **Copyright / redistribution:** Internal — derived from exam content; reuse for diagnostic requires ensuring questions are re-framed (not direct exam reproduction) if copyright applies
- **Suitable for Diagnostic?** YES — best verified answer-key source; can link via `diagnostic_question_bank.source_reference = past_exam_id` + `source_type = 'verified'`; can filter by `subject` (via `subjects.id`), `curriculum`, `academic_year`

---

## C. What Content Is Actually Available (per source)

| Source | Direct Question Access | Answer Key | Unit-Level Filtering | Bulk Insert Ready |
|---|---|---|---|---|
| MOE E-Learning (`moe.gov.eg/elearningenterypage`) | Browse-by-unit (not bulk) | Partial (via materials) | Yes (by study unit) | No (web platform) |
| NIC Assessment Standards | No | N/A | N/A | No |
| Phase 1.1 Past Exams | Internal DB (`past_exam_questions`) | YES (`past_exam_answers`) | Via `subjects` + `academic_years` | Partial (requires manual/filtered extraction; not automated bulk) |

**Conclusion:** There is NO external bulk-downloadable verified question PDF/CSV/JSON for Egypt Secondary Math that can be inserted automatically. The verified sources are: MOE (browse, no bulk), Phase 1.1 DB (internal, verified answers, filterable). No fake questions inserted; bank remains empty (correct per §4).

---

## D. Question / Answer Verification Status

| Source | Questions Verified | Answers Verified | Method | Status for Bank |
|---|---|---|---|---|
| MOE E-Learning | Yes (by curriculum link) | Partial (materials) | Platform browse / report reference | `official` — can reference; direct bulk insert not available |
| NIC Standards | N/A | N/A | Standards doc | Not a question source |
| Phase 1.1 `past_exam_questions` | YES (ingested, verified) | YES (`past_exam_answers` FK) | DB FK + `answer_text`/`answer_type` | `verified` — link via `source_reference`; filter by `subject_id` + `academic_year` |

**No AI-generated questions used. No fabricated sources. No `verified` status assigned without real verification.**

---

## E. Recommended Ingestion Source (design only — not executed)

**Primary:** Phase 1.1 `past_exam_questions` + `past_exam_answers` (verified answers exist; filterable by `subject_id` via `subjects` table; link to `diagnostic_question_bank` via `source_reference` / `source_type = 'verified'`).

**Secondary / Supplement:** MOE E-Learning (`https://moe.gov.eg/ar/elearningenterypage/e-learning`) for additional verified questions by unit — requires manual/curated selection (not automatic ingestion) because no bulk API/CSV exists; each selected question must have verified answer from materials or paired with exam-derived answer.

**Not recommended for bank (correct rejections):**
- AI-generated questions (explicitly excluded by design — `quiz-generator` not a source of truth)
- Random web PDF URLs (none verified in reports)
- Unverified educational sites (no authority established)
- Direct copy of MOE full content (copyright / redistribution unverified; design keeps reference only)

**Recommended ingestion process (design — Phase 1.2C/1.2D, not now):**
1. Filter `past_exam_questions` by `subjects.name` / `curricula.name` / `academic_years.year_value` → select Math / Secondary / 2023–2024.
2. For each selected question: verify `answer_text` in `past_exam_answers`.
3. Insert into `diagnostic_question_bank` with:
   - `subject_id` = matching `subjects.id`
   - `unit_id` = matching `diagnostic_units.id` (after taxonomy mapping)
   - `topic_id` = matching `diagnostic_topics.id`
   - `correct_option_index` = derived from `answer_text` / `answer_type`
   - `source_type` = `'verified'`
   - `source_name` = `'past_exams_bank_2023_2024'` (or similar)
   - `source_reference` = `past_exam_id`
   - `status` = `'verified'` (before `published` — requires admin verification)
4. If MOE questions are selected manually: `source_type` = `'official'`; `status` = `'verified'` (pending admin); `source_reference` = MOE URL.

---

## F. Copyright / Legal Notes

- MOE `moe.gov.eg`: Government educational content — public for students within Egypt; redistribution/commercial use not confirmed. For internal diagnostic bank (student study only), reference/link is safe; bulk copy of full content requires verification (not performed — design only, no insert).
- Phase 1.1 past exams: Internal to project; derived from actual exam sources (verified by ingestion report). Reuse within same project for student diagnostic is acceptable; external redistribution requires review.
- `diagnostic_question_bank` design uses `source_reference` to track origin — supports future copyright/attribution needs.

---

## G. Bank Filtering Contract (design — for 1.2C/1.2D)

Based on `diagnostic_question_bank` schema (1.2A) + existing taxonomy:

| Filter Dimension | Column / Source | Filter Expression (design) | Example (Egypt Math) |
|---|---|---|---|
| Subject | `subject_id` → `subjects.id` → `subjects.name`/`code` | `subject_id = $1` | Mathematics (`subjects.name` like `%math%`) |
| Curriculum | `subjects.curriculum_id` → `curricula.id` / `curricula.name` | `subjects.curriculum_id = $2` | General Secondary (`curricula.name`) |
| Academic Year | `subjects.academic_year` (via past_exams / exam mapping) — design links via `past_exam` reference | `past_exam.academic_year_id = $3` | 2023–2024 |
| Unit | `unit_id` → `diagnostic_units.id` / `name` / `code` | `unit_id = $4` OR `unit_id IN (...)` | Algebra / Geometry |
| Topic | `topic_id` → `diagnostic_topics.id` / `name` / `type` | `topic_id = $5` | Linear Equations (`type='topic'`) |
| Difficulty | `difficulty` (controlled: `easy`/`medium`/`hard`) | `difficulty IN (...)` | `medium` |
| Source Type | `source_type` (controlled: `official`/`verified`/`curated`/`validated`) | `source_type IN ('official','verified','curated','validated')` | `'verified'` (past exams) |
| Status | `status` (controlled: `draft`/`verified`/`published`/`archived`) | `status = 'published'` (for public read per RLS) | `'published'` |
| Answer Verified | `correct_option_index` IS NOT NULL + `status` = `'verified'`/`'published'` | `correct_option_index IS NOT NULL AND status IN ('verified','published')` | YES |

**Selection of 10–15 for diagnostic (deterministic):**
- Filter by `subject_id` + `unit_id` (optional) + `difficulty` (mixed: 3 easy / 7 medium / 5 hard — design approximation, not final)
- Filter `status = 'published'` + `source_type IN (...)` (verified only)
- Order by `display_order` / `created_at` / random with seed (for reproducible selection)
- Limit 10–15
- Ensure `correct_option_index` is populated for all (integrity constraint at application layer — DB doesn't enforce JSON array index validity, kept as design-level guard)

---

## H. Taxonomy Mapping (reuse existing — no new taxonomy beyond 1.2A)

```
Country          → countries.id  (existing — Phase 1.1)
  ↓
Curriculum       → curricula.id  (existing — Phase 1.1)
  ↓
Subject          → subjects.id  (existing — Phase 1.1; links to curriculum via curriculum_id)
  ↓
Unit             → diagnostic_units.id  (1.2A — links to subjects.id)
  ↓
Topic/Chapter    → diagnostic_topics.id  (1.2A — links to unit_id + subject_id; type = 'topic'/'chapter'/'lesson')
  ↓
Question         → diagnostic_question_bank.id  (1.2A — links to subject_id, optional unit_id, optional topic_id)
```

**No duplicate of `countries`/`curricula`/`subjects`.** `diagnostic_units` + `diagnostic_topics` extend existing `subjects`; `stage`/`grade` reserved on `curricula` (nullable, no data — for future Primary/Preparatory/University without breaking Secondary now).

---

## I. Schema Changes Needed?

**Answer: NO new schema needed for 1.2B (design only, no insert).**

`db/diagnostic-question-bank-foundation.sql` (1.2A) already supports:
- `subject_id` FK → `subjects.id`
- `unit_id` FK → `diagnostic_units.id`
- `topic_id` FK → `diagnostic_topics.id`
- `source_type` / `status` / `difficulty` / `correct_option_index` / `options_json`
- RLS (public read only `published` + verified sources; admin via `site_admins`)

**If future insertion requires additional fields:**
- `source_url` (text, optional) — for direct MOE link reference (can be added via `ALTER ... ADD COLUMN IF NOT EXISTS`; not needed for design)
- `language` (`ar`/`en`) — if bilingual questions added (reserved; not added now per instruction)

**No alter to `past_exams` / `subjects` / `curricula` / `academic_years`.**

---

## J. Can Real Questions Be Inserted Now?

**Answer: NO — not without verified source content + manual/curated selection + admin verification.**

Reasons (each verified):
1. **No bulk verified source:** Only MOE browse-platform (no bulk download); Phase 1.1 DB has questions but requires filtering/selection by admin (not automated).
2. **No verified answer for all MOE questions:** MOE provides questions + explanations; full answer-key availability per individual question not fully confirmed from URL alone.
3. **Copyright / redistribution unverified for direct bulk copy:** Design requires `source_reference`; bulk insert would need legal confirmation.
4. **No admin verification completed:** `status = 'verified'` requires admin review; design requires verification before `published`.
5. **Correct answer must be deterministic:** `correct_option_index` requires knowing correct option — available for past-exam questions (via `past_exam_answers`), not automatically for all MOE questions.

**Correct action (per instruction §4):** Do NOT insert. Document bank remains empty; wait for verified selection process (Phase 1.2B recommendation serves as design for that process, not execution).

---

## K. Risks / Blockers

| Risk / Blocker | Evidence | Mitigation (design) |
|---|---|---|
| No bulk verified source available | Only MOE browse-platform; no PDF/CSV/JSON link in reports | Design uses Phase 1.1 DB as primary verified source; MOE as supplement (manual selection) |
| Answer key partial for MOE | MOE news says questions + explanations; full answer key per question not confirmed from URL | Pair MOE questions with `past_exam_answers` where available; require admin verification for any `verified`/`published` status |
| Copyright / redistribution | MOE content = government; bulk copy unverified | Keep `source_reference` to URL; do NOT bulk-copy; insert only selected verified questions with attribution |
| Taxonomy gap (no unit/topic data for existing subjects) | `diagnostic_units` / `diagnostic_topics` empty (1.2A seed is taxonomy-only, no verified data) | Admin creates units/topics per subject before inserting questions; filter uses existing `subjects.id` regardless |
| No AI compensation allowed | Explicit exclusion (§9, §1.1 design) | Design uses verified sources + deterministic scoring; AI only for optional explanation (post-MVP) |
| DB apply deferred (1.2A SQL not executed) | Service key masked; no CLI | 1.2A SQL ready; 1.2B requires no schema change; no blocker |
| Scalability (other subjects / Arabic / English / Primary / University) | Design uses `subjects` FK + reserved `stage`/`grade`; `question_type` only `mcq`/`true_false` | Schema supports all; data insertion deferred; language field can be added if needed |

---

## Design Decisions (explicit — per instruction priorities)

1. **SOURCE FIRST:** Proper order is source → bank → filter → selection → insert. This report covers source; no insert performed (correct).
2. **REUSE FIRST:** Existing `past_exam_questions` + `subjects` + `curricula` reused; no new country/curriculum/subject; new `units`/`topics` extend only.
3. **VERIFIED ONLY:** No `verified` or `published` status assigned without verification; `source_type` restricted to official/verified/curated/validated.
4. **NO AI:** `quiz-generator` not used; no `AgentRouter` call; no AI API call; SQL has 0 AI references.
5. **NO FAKE DATA:** Zero `INSERT INTO diagnostic_question_bank`; bank count remains 0.
6. **NO SCHEMA CHANGE FOR 1.2B:** `db/diagnostic-question-bank-foundation.sql` sufficient; nothing to alter.
7. **NO UI / SCORING / ATTEMPTS:** Design report only; all deferred.
8. **STATIC ≠ LIVE:** Source audit is static (files/web); no claim of live DB verification made.

---

## Summary (for 1.2C approval decision)

- **Verified sources audited:** 3 real (MOE, NIC, Phase 1.1 DB); 0 invented.
- **Real questions insertable now?** NO — requires curated selection + admin verification + legal confirmation (design specifies process, not execution).
- **Bank status:** Empty (`question count = 0`); schema ready.
- **Filtering contract designed:** Yes — by `subject_id` + `unit_id` + `topic_id` + `difficulty` + `status` + `source_type`.
- **Taxonomy mapped:** `countries → curricula → subjects → diagnostic_units → diagnostic_topics → diagnostic_question_bank`; staged/grade reserved.
- **Schema change needed?** NO.
- **Next step (after approval):** 1.2C — design filter/selection mechanism (or proceed to 1.2D scoring design using empty verified-ready bank).

---

*Report: `PHASE_1_2B_QUESTION_SOURCE_REPORT.md` — created 2026-09-03. Design only. No DB inserts. No source edits. No AI. No commit/push.*
