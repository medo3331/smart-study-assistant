-- ============================================================================
-- Phase 4.5 — retire diagnostic_question_bank
-- ----------------------------------------------------------------------------
-- The ten questions moved to past_exam_questions in 4.3, every reader moved
-- across in 4.4, and this removes what is left. Nothing is deleted from the
-- product: the questions, their topics, their answer keys and every one of
-- the 365 recorded answers already live in the exam bank. What disappears
-- here is a second copy and the plumbing that pointed at it.
--
-- ════════════════════════════════════════════════════════════════════════════
-- ORDER MATTERS
-- ════════════════════════════════════════════════════════════════════════════
-- The foreign key first, then the column, then the table. The column carries
-- the legacy UNIQUE(session_id, question_id) with it, which is the point:
-- after this, ONE index defends the invariant — the canonical one — instead
-- of two that had to agree with each other on 365 rows.
--
-- ════════════════════════════════════════════════════════════════════════════
-- TWO THINGS THIS FILE COULD NOT HAVE KNOWN
-- ════════════════════════════════════════════════════════════════════════════
-- The preflight audit for this phase asked whether any function READS
-- diagnostic_answers.question_id. The answer was a clean no. That was not
-- enough: submit_diagnostic_answers was still WRITING the column on every
-- submit, and the submit route was still SELECTING it, so dropping the
-- column turned every submission into a 400 and then a 500. The companion
-- file db/phase4-5-retire-legacy-question-id.sql repairs the function, and
-- app/api/diagnostic/submit/route.ts repairs the route. Run them before this
-- one on a database that still has the column.
--
-- The lesson is the audit's, not the SQL's: a read check is not a write
-- check. The correct question is whether the name appears anywhere in the
-- body, with comments stripped, and the verification section at the bottom
-- of the companion file now asks it that way.
--
-- ════════════════════════════════════════════════════════════════════════════
-- WHAT IS DELIBERATELY KEPT
-- ════════════════════════════════════════════════════════════════════════════
-- past_exam_questions.source_question_id is left exactly as it is. It was
-- never a foreign key — that was the decision in 4.4-B — and it is the only
-- remaining record of which old question each exam question came from. It now
-- holds uuids that resolve to nothing, which is what a provenance marker is:
-- it says where the question came from, not that the source is still
-- readable. Nulling it would destroy the lineage and gain nothing.
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- 1. The audit view. It read the old bank directly and nothing calls it; it
--    was described in its own migration as a read helper, not a dependency.
-- ----------------------------------------------------------------------------
drop view if exists public.diagnostic_bank_summary;

-- ----------------------------------------------------------------------------
-- 2. The foreign key. ON DELETE RESTRICT is why the table could not be dropped
--    before this, and why 335 answers each had to be resolvable against the
--    old bank while it existed.
-- ----------------------------------------------------------------------------
alter table public.diagnostic_answers
  drop constraint if exists diagnostic_answers_question_id_fkey;

-- ----------------------------------------------------------------------------
-- 3. The column, and with it the legacy unique guard.
--
--    bank_question_id is NOT NULL and already backfilled on every row, so
--    nothing is lost that cannot be recovered from the exam bank.
-- ----------------------------------------------------------------------------
alter table public.diagnostic_answers
  drop column if exists question_id;

-- ----------------------------------------------------------------------------
-- 4. The table.
-- ----------------------------------------------------------------------------
drop table if exists public.diagnostic_question_bank;

commit;

-- ============================================================================
-- VERIFICATION (run after)
-- ============================================================================
-- 1. The old table is gone and the exam bank is not:
--    select count(*) from information_schema.tables
--     where table_schema='public' and table_name='diagnostic_question_bank';
--    EXPECTED: 0
--    select count(*) from past_exam_questions;
--    EXPECTED: 10
--
-- 2. Nothing points at it any more:
--    select count(*) from pg_constraint
--     where confrelid = 'public.diagnostic_question_bank'::regclass;
--    EXPECTED: 0 rows returned rather than an error -- note that casting a
--    dropped table raises, so on a database where it is gone this query fails
--    to parse and that is itself the answer. Use the form below when the
--    table is already absent:
--    select count(*)::int from pg_class c join pg_namespace n
--      on n.oid=c.relnamespace
--     where n.nspname='public' and c.relname='diagnostic_question_bank';
--    EXPECTED: 0
--
-- 3. The answer record kept its history and lost only the duplicate pointer:
--    select count(*)::int as answers,
--           count(*) filter (where bank_question_id is not null)::int as linked,
--           count(*) filter (where is_correct)::int as correct
--      from diagnostic_answers;
--    EXPECTED: 365, 365, 192
--
-- 4. One uniqueness guard, not two:
--    select indexname from pg_indexes where schemaname='public'
--      and indexname like 'diagnostic_answers%uniq%'
--       or indexname = 'diagnostic_answers_session_id_question_id_key';
--    EXPECTED: diagnostic_answers_session_bank_question_uniq only
--
-- 5. The lineage survived, as provenance rather than as a resolvable
--    reference:
--    select count(*)::int from past_exam_questions
--     where source_question_id is not null;
--    EXPECTED: 10
--
-- 6. The scoring path still works end to end. This is the one that matters,
--    because the two files this drop depended on were both wrong in a way no
--    static check would have found:
--    node scripts/smoke/smoke-4.4h.mjs
--    EXPECTED: 0 failed
-- ============================================================================
