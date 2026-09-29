-- ============================================================================
-- Phase 4.2 — Exam bank schema: identity and question metadata
-- ----------------------------------------------------------------------------
-- Schema only. No row is inserted, updated or deleted, and no question is
-- migrated. That is Phase 4.3.
--
-- ════════════════════════════════════════════════════════════════════════════
-- WHAT THIS ADDS
-- ════════════════════════════════════════════════════════════════════════════
-- past_exams
--   exam_code text unique  -- the business identity of an exam
--
-- past_exam_questions
--   topic_id              uuid   -> diagnostic_topics(id)
--   difficulty            text   -- easy | medium | hard | null
--   options_json          jsonb  -- the choices, when the type has any
--   correct_option_index  integer-- 0-based, when the type is auto-graded
--   verification_status   text   -- pending | verified | rejected
--   source_note           text   -- provenance
--
-- ════════════════════════════════════════════════════════════════════════════
-- WHY exam_code AND NOT A CONSTRAINT OVER EXISTING COLUMNS
-- ════════════════════════════════════════════════════════════════════════════
-- A unique index on (subject, academic_year, exam_date) looks equivalent
-- and is not. exam_date is null on the row we have, and a null makes
-- every row distinct in a unique index, so the constraint would never
-- fire. It is also wrong on the facts: one subject and year legitimately
-- has more than one sitting (a mock, a first round, a second round), and
-- two different subjects can be examined on the same day. An explicit code
-- says which exam this is without having to enumerate the combinations.
--
-- It stays nullable. The existing exam predates the column, and leaving it
-- null is more honest than inventing a code we cannot cite. Unique
-- constraints ignore nulls, so old rows do not collide.
--
-- ════════════════════════════════════════════════════════════════════════════
-- WHY options_json AND correct_option_index ARE NULLABLE
-- ════════════════════════════════════════════════════════════════════════════
-- question_type already admits mcq, short, essay, fill and true_false. An
-- essay has no options and no auto-graded answer, so NOT NULL on either
-- column would make the existing CHECK a lie. A question type and the
-- columns only some types need have to agree, and the cheapest honest way
-- to express that is nullable columns plus a validation in the ingestion
-- path.
--
-- correct_option_index is checked only for >= 0, not for an upper bound:
-- a question with two or five options is legitimate, and hard-coding four
-- would have to be relaxed later anyway. The real check is that the index
-- addresses an option that exists, which is a per-row property the
-- database cannot express across a jsonb array.
--
-- ════════════════════════════════════════════════════════════════════════════
-- WHY difficulty IS NULLABLE WITH NO DEFAULT
-- ════════════════════════════════════════════════════════════════════════════
-- Defaulting to medium would put an invented number into a column that
-- then looks like a verified one. Null is the truthful state: we do not
-- know yet.
--
-- ════════════════════════════════════════════════════════════════════════════
-- WHY verification_status EXISTS AS A STATE MACHINE, NOT A NOTE
-- ════════════════════════════════════════════════════════════════════════════
-- source_note is prose and cannot be filtered on. If extraction ever
-- produces five hundred questions, the only way to keep a bad one out of
-- a student's diagnostic is a queryable column:
--
--     pending   just extracted, nobody has looked
--     verified  a human checked the text, the options and the answer
--     rejected  reviewed and not usable
--
-- The consumer rule that makes this worth having: the diagnostic reads
-- verification_status = 'verified' only. Everything else is invisible to
-- students no matter how much of it exists in the table.

-- ============================================================================
-- THE STATEMENTS
-- ============================================================================

-- 1) past_exams.exam_code -- explicit identity, unique, nullable.
alter table public.past_exams
  add column if not exists exam_code text;

-- A single exam cannot carry two codes, but exams without one are still
-- allowed and do not collide with each other.
create unique index if not exists past_exams_exam_code_key
  on public.past_exams (exam_code)
  where exam_code is not null;

comment on column public.past_exams.exam_code is
  'Stable business identifier for an exam, e.g. MATH-2024-FINAL. Unique when present, nullable while historical exams are uncoded. Preferred over a unique index on (subject, year, date): exam_date is nullable, a null never collides, and one subject and year legitimately has several sittings.';


-- 2) past_exam_questions -- the metadata the diagnostic needs to select a
--    question by topic and difficulty, and the columns it needs to score.
alter table public.past_exam_questions
  add column if not exists topic_id uuid references public.diagnostic_topics (id) on delete set null,
  add column if not exists difficulty text,
  add column if not exists options_json jsonb,
  add column if not exists correct_option_index integer,
  add column if not exists verification_status text not null default 'pending',
  add column if not exists source_note text;

-- difficulty: null means we do not know. No default, because a default
-- would present an invented value as a recorded one.
alter table public.past_exam_questions
  drop constraint if exists past_exam_questions_difficulty_check;
alter table public.past_exam_questions
  add constraint past_exam_questions_difficulty_check
  check (difficulty is null or difficulty in ('easy', 'medium', 'hard'));

-- The review state machine. Not null with a default of pending, so a
-- question can never land in the bank already marked verified.
alter table public.past_exam_questions
  drop constraint if exists past_exam_questions_verification_check;
alter table public.past_exam_questions
  add constraint past_exam_questions_verification_check
  check (verification_status in ('pending', 'verified', 'rejected'));

-- Lower bound only. Two or five option questions are legitimate, so no
-- upper bound; whether the index addresses a real option is checked by
-- the ingestion path, which is the only layer that can read the array.
alter table public.past_exam_questions
  drop constraint if exists past_exam_questions_correct_option_check;
alter table public.past_exam_questions
  add constraint past_exam_questions_correct_option_check
  check (correct_option_index is null or correct_option_index >= 0);

-- options_json is an array when present, so a scalar or an object is
-- rejected at the boundary rather than failing later in the UI.
alter table public.past_exam_questions
  drop constraint if exists past_exam_questions_options_shape_check;
alter table public.past_exam_questions
  add constraint past_exam_questions_options_shape_check
  check (options_json is null or jsonb_typeof(options_json) = 'array');

-- 3) Indexes for the way the diagnostic will actually query.
--    Selecting verified questions for a topic is the hot path once the
--    diagnostic reads from this table instead of diagnostic_question_bank.
create index if not exists past_exam_questions_topic_idx
  on public.past_exam_questions (topic_id)
  where topic_id is not null;

create index if not exists past_exam_questions_verified_topic_idx
  on public.past_exam_questions (topic_id, difficulty)
  where verification_status = 'verified' and topic_id is not null;

create index if not exists past_exam_questions_verification_status_idx
  on public.past_exam_questions (verification_status);


-- 4) Documentation on the table itself.
comment on column public.past_exam_questions.topic_id is
  'The topic this question measures. This is the link the product runs on: question -> topic -> mastery -> weak topic -> study plan. Null while unclassified; on delete set null so retiring a topic never deletes a question.';

comment on column public.past_exam_questions.difficulty is
  'easy | medium | hard, or null when unknown. Deliberately no default: defaulting to medium would file an invented value alongside a recorded one.';

comment on column public.past_exam_questions.options_json is
  'The choices, as a jsonb array. Null for question types that have none (essay, short, fill). Shape checked here; that each option is non-empty text is checked by ingestion.';

comment on column public.past_exam_questions.correct_option_index is
  'Zero-based index of the correct option, for auto-graded types only. Null for essay and short answer, whose grading lives in past_exam_answers. Checked for >= 0 only, because the number of options is per-question; that the index addresses a real option is the ingestion path''s job.';

comment on column public.past_exam_questions.verification_status is
  'pending | verified | rejected. Defaults to pending, so nothing reaches the bank already marked verified. Consumers, including the diagnostic, must filter on verified = true: a rejected or unreviewed question is invisible to students however much of it exists in the table.';

comment on column public.past_exam_questions.source_note is
  'Provenance in prose, e.g. "Official Ministry exam 2024" or "AI extracted from uploaded PDF, verified manually". For auditing and for the human reviewing the queue; not a filterable state, which is what verification_status is for.';

comment on table public.past_exam_questions is
  'Questions of a past exam, and from Phase 4.2 the metadata the diagnostic selects and scores on. Auto-grading uses correct_option_index; past_exam_answers holds the reference answer and stays a separate concern. Read-only to clients since Phase 4.0: content is ingested server-side with DATABASE_URL, which reaches the table as owner.';

-- ============================================================================
-- RLS
-- ============================================================================
-- Intentionally untouched. Phase 4.0 revoked the client write grants and
-- dropped the broken admin policies; ALTER TABLE ... ADD COLUMN does not
-- restore a grant. The new columns are exactly as read-only as the tables
-- they live on. Ingestion keeps running server-side with DATABASE_URL,
-- which bypasses RLS as the table owner.

-- ============================================================================
-- ROLLBACK
-- ============================================================================
-- Fully reversible while the new columns are still empty, which they are
-- by construction in this migration:
--
--   alter table public.past_exam_questions
--     drop column if exists source_note,
--     drop column if exists verification_status,
--     drop column if exists correct_option_index,
--     drop column if exists options_json,
--     drop column if exists difficulty,
--     drop column if exists topic_id;
--
--   drop index if exists past_exam_questions_verification_status_idx;
--   drop index if exists past_exam_questions_verified_topic_idx;
--   drop index if exists past_exam_questions_topic_idx;
--   drop index if exists past_exam_questions_options_shape_check;
--   drop index if exists past_exams_exam_code_key;
--
--   alter table public.past_exams drop column if exists exam_code;
--
-- ⚠️ Once Phase 4.3 has moved real questions in, dropping these columns
--    is a data-loss operation. Use it to undo the schema, not the content.

-- ============================================================================
-- VERIFICATION (run after)
-- ============================================================================
-- 1. Columns and nullability:
--    select table_name, column_name, is_nullable, column_default
--      from information_schema.columns
--     where table_name in ('past_exams','past_exam_questions')
--       and column_name in ('exam_code','topic_id','difficulty','options_json',
--                           'correct_option_index','verification_status','source_note')
--     order by 1,2;
--    EXPECTED: exam_code nullable, no default; verification_status NOT NULL
--              default 'pending'; the other five nullable.
--
-- 2. Row counts unchanged:
--    select (select count(*) from past_exams)          as exams,
--           (select count(*) from past_exam_questions) as questions;
--    EXPECTED: 1, 0
--
-- 3. The topic FK resolves:
--    select conname, pg_get_constraintdef(oid) from pg_constraint
--     where conname = 'past_exam_questions_topic_id_fkey';
--
-- 4. All four CHECKs exist:
--    select conname from pg_constraint
--     where conrelid = 'past_exam_questions'::regclass and contype = 'c'
--       and conname like 'past_exam_questions_%_check' order by 1;
--
-- 5. Client grants still SELECT only:
--    select grantee, string_agg(privilege_type, ',')
--      from information_schema.role_table_grants
--     where table_name in ('past_exams','past_exam_questions')
--       and grantee in ('anon','authenticated')
--     group by 1;
--    EXPECTED: anon[SELECT], authenticated[SELECT]
-- ============================================================================
