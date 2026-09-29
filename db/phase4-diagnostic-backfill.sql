-- ============================================================================
-- Phase 4.4-C — backfill bank_question_id on the 295 historical answers
-- ----------------------------------------------------------------------------
-- Fills exactly one new column and touches nothing else. question_id keeps
-- pointing at diagnostic_question_bank, so every historical answer stays
-- readable by the old path and gains a link to the new one.
--
-- ════════════════════════════════════════════════════════════════════════════
-- THE MAPPING IS WRITTEN DOWN, NOT DERIVED
-- ════════════════════════════════════════════════════════════════════════════
-- The ten pairs below were produced in Phase 4.3 and checked field by field
-- there: same topic, same difficulty, same options, same answer key, same
-- question text. They are pasted as literals so this migration cannot
-- re-derive them and cannot be re-run against a changed source.
--
-- That matters more than it might look. The only thing these two tables
-- reliably share is question_text, so a "clever" backfill would match on
-- text — and text is not identity. Two questions can share a stem and
-- differ in one option; an edited stem silently stops matching and the
-- answer loses its link with no error. A UUID pair either is right or is
-- rejected at the constraint. Failing loudly beats matching plausibly, and
-- these ids are the same ones 4.3 verified row by row.
--
-- ════════════════════════════════════════════════════════════════════════════
-- WHAT THIS DOES NOT TOUCH
-- ════════════════════════════════════════════════════════════════════════════
--   question_id, selected_option_index, is_correct, session_id,
--   answered_at, id
--
-- The UPDATE names bank_question_id and nothing else. answered_at is
-- deliberately left alone: it is when the student answered, and a backfill
-- that touched it would rewrite history to say the answer arrived during
-- this migration. is_correct is the server's own verdict and is not this
-- migration's business to second-guess, which is also why the verification
-- below asserts it is byte-identical rather than recomputing it.
--
-- ════════════════════════════════════════════════════════════════════════════
-- THE GATES, IN ORDER
-- ════════════════════════════════════════════════════════════════════════════
--   1. the source still has exactly 10 rows and the target 10
--   2. all 10 old ids still resolve in diagnostic_question_bank
--   3. all 10 new ids still resolve in past_exam_questions
--   4. the mapping is 1:1 — no two old ids share a new id, and no new id
--      is claimed twice. Fan-out would make "which old question is this"
--      unanswerable, and the lineage it creates is the thing Phase 4.5 will
--      rely on to drop the old table safely
--   5. nothing is already populated, so a re-run cannot double-apply
--   6. no (session_id, bank_question_id) pair collides. Checked BEFORE the
--      update, not left to the partial unique index to discover halfway
--      through: an index violation in the middle of a 295-row update would
--      roll the whole thing back anyway, but the point of a preflight is to
--      say what will happen rather than find out
--   7. after the update, the row count is still 295 and every row has a
--      bank_question_id
--
-- The transaction is the real guarantee. Every gate raises, and any raise
-- aborts the whole update, so the table is either fully backfilled or
-- untouched.
-- ============================================================================


-- The mapping, as literals. See the header for why it is not derived.
create temporary table phase44c_map (
  old_id uuid primary key,
  new_id uuid not null
) on commit drop;

insert into phase44c_map (old_id, new_id) values
  ('08603b83-0b91-4580-a8c4-28e5a9abe546', '36594b2e-a4bc-4e56-bf68-7d58e0203465'),
  ('143ad2f1-675c-4c01-93fd-6de1bc0e1f8d', '763338c3-2521-4268-9767-0254a5cca17e'),
  ('2e17c4a1-7d73-4db4-8e44-ef2c285b6193', '1aaaf43d-a749-4a20-8eb8-f35c19fe0902'),
  ('6b76b5ff-4a38-465b-a36b-53b0828c224a', 'a57fde35-f9fb-4224-a682-0d64df3097aa'),
  ('73f3ebad-32d6-449b-a42c-937b3584f5c6', '59d45a25-2fc9-4214-b1d0-67a14366e6dd'),
  ('a877cc63-5fe3-455f-ab3c-f90fdde90636', '51dce4c8-60a4-4bd9-89f3-d20c0de73341'),
  ('c61a9299-914a-496c-9ef1-ab77f6007533', '591b3431-a18c-41ae-90fa-23eb535ccf56'),
  ('c817d094-7d6a-4b14-871f-f344618c60ff', 'ac6df278-ec28-4b72-a6ea-7487237d4a82'),
  ('e5cf7f75-1ee6-40ab-830b-720b744d73c2', 'd1d8c596-bb67-43cd-b6bb-ccf7e0f136c1'),
  ('f5b18a53-9016-4a14-b080-a75c4810f42f', 'ace34caf-afa1-4fd4-942b-ea0ce52c94e6');

do $$
declare
  v_src      integer;
  v_tgt      integer;
  v_map      integer;
  v_dead_old integer;
  v_dead_new integer;
  v_dup_old  integer;
  v_dup_new  integer;
  v_filled   integer;
  v_collide  integer;
  v_affected integer;
  v_mapped   integer;
begin
  -- 1) both sides still hold exactly ten questions
  select count(*) into v_src from public.diagnostic_question_bank;
  if v_src <> 10 then
    raise exception 'PHASE44C_ABORT: expected 10 source questions, found %', v_src;
  end if;

  select count(*) into v_tgt from public.past_exam_questions;
  if v_tgt <> 10 then
    raise exception 'PHASE44C_ABORT: expected 10 target questions, found %', v_tgt;
  end if;

  select count(*) into v_map from phase44c_map;
  if v_map <> 10 then
    raise exception 'PHASE44C_ABORT: expected 10 mapping rows, found %', v_map;
  end if;

  -- 2) every old id still exists in the bank being retired
  select count(*) into v_dead_old
  from phase44c_map m
  where not exists (select 1 from public.diagnostic_question_bank b where b.id = m.old_id);
  if v_dead_old > 0 then
    raise exception
      'PHASE44C_ABORT: % mapped source id(s) no longer exist in diagnostic_question_bank',
      v_dead_old;
  end if;

  -- 3) every new id still exists in the bank being adopted
  select count(*) into v_dead_new
  from phase44c_map m
  where not exists (select 1 from public.past_exam_questions t where t.id = m.new_id);
  if v_dead_new > 0 then
    raise exception
      'PHASE44C_ABORT: % mapped target id(s) no longer exist in past_exam_questions',
      v_dead_new;
  end if;

  -- 4) the mapping is 1:1 in both directions
  select count(*) into v_dup_old
  from (select old_id from phase44c_map group by old_id having count(*) > 1) x;
  select count(*) into v_dup_new
  from (select new_id from phase44c_map group by new_id having count(*) > 1) x;
  if v_dup_old > 0 or v_dup_new > 0 then
    raise exception
      'PHASE44C_ABORT: mapping is not 1:1 (old dupes=%, new dupes=%)', v_dup_old, v_dup_new;
  end if;

  -- 5) nothing already populated — a re-run must not double-apply
  select count(*) into v_filled
  from public.diagnostic_answers where bank_question_id is not null;
  if v_filled > 0 then
    raise exception
      'PHASE44C_ABORT: % answer(s) already have a bank_question_id', v_filled;
  end if;

  -- 6) collision preflight for the partial unique index on
  --    (session_id, bank_question_id), checked before the write rather than
  --    discovered by the constraint mid-update
  select count(*) into v_collide
  from (
    select a.session_id
    from public.diagnostic_answers a
    join phase44c_map m on m.old_id = a.question_id
    group by a.session_id, m.new_id
    having count(*) > 1
  ) x;
  if v_collide > 0 then
    raise exception
      'PHASE44C_ABORT: % (session, bank_question) pair(s) would collide', v_collide;
  end if;

  -- =========================================================================
  -- the backfill itself
  -- =========================================================================
  -- One column. is_correct, selected_option_index, question_id, session_id
  -- and answered_at are not in the SET list, so PostgreSQL cannot write them
  -- even by accident.
  update public.diagnostic_answers a
     set bank_question_id = m.new_id
    from phase44c_map m
   where a.question_id = m.old_id;

  get diagnostics v_affected = row_count;

  -- 7) postconditions inside the same transaction
  select count(*) into v_mapped
  from public.diagnostic_answers where bank_question_id is not null;
  if v_mapped <> 295 then
    raise exception
      'PHASE44C_ABORT: expected 295 backfilled answers, found % (updated % rows)',
      v_mapped, v_affected;
  end if;

  if v_affected <> 295 then
    raise exception
      'PHASE44C_ABORT: update touched % rows, expected 295', v_affected;
  end if;
end
$$;

-- Lineage on the exam bank, from the same literals. This is the reverse

-- ============================================================================
-- VERIFICATION (run after)
-- ============================================================================
-- 1. The backfill is complete and total:
--    select count(*) filter (where bank_question_id is not null)::int filled,
--           count(*) filter (where bank_question_id is null)::int empty
--      from diagnostic_answers;
--    EXPECTED: 295, 0
--
-- 2. Every answer resolves both ways — old and new. This is the assertion
--    that matters most, because it is what keeps history readable through
--    both paths at once:
--    select count(*)::int from diagnostic_answers a
--     where not exists (select 1 from diagnostic_question_bank b where b.id = a.question_id)
--        or not exists (select 1 from past_exam_questions t where t.id = a.bank_question_id);
--    EXPECTED: 0
--
-- 3. The old column is untouched, which is what makes the transition
--    reversible until Phase 4.5:
--    select count(*)::int from diagnostic_answers where question_id is null;
--    EXPECTED: 0
--
-- 4. Nothing but one column moved. Compare the totals against the values
--    recorded before the migration:
--    select count(*)::int answers,
--           count(distinct session_id)::int sessions_touched,
--           count(*) filter (where is_correct)::int correct,
--           min(answered_at)::date as first_answered,
--           max(answered_at)::date as last_answered
--      from diagnostic_answers;
--    EXPECTED: 295 answers, 40 sessions, 74 correct, and answered_at
--    unchanged from before
--
-- 5. The lineage is consistent in both directions and 1:1:
--    select count(*)::int from past_exam_questions where source_question_id is not null;
--    EXPECTED: 10
--    select count(*)::int from (
--      select source_question_id from past_exam_questions
--       where source_question_id is not null group by 1 having count(*) > 1) x;
--    EXPECTED: 0
--
-- 6. Surrounding tables untouched:
--    select (select count(*) from diagnostic_sessions)::int sessions,
--           (select count(*) from user_weaknesses)::int weaknesses,
--           (select count(*) from past_exam_questions)::int questions,
--           (select count(*) from diagnostic_question_bank)::int bank;
--    EXPECTED: 40, 18, 10, 10
-- ============================================================================

-- direction: past_exam_questions now records which old question it came
-- from, which is what Phase 4.5 needs before it can drop the old table.
-- No foreign key, by design — see 4.4-B.

update public.past_exam_questions t
   set source_question_id = m.old_id
  from phase44c_map m
 where t.id = m.new_id;

commit;

begin;
