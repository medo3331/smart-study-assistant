-- ============================================================================
-- Phase 4.4-B — transition schema for the exam-bank switch
-- ----------------------------------------------------------------------------
-- Two columns, no backfill, no RPC change. This checkpoint exists so the
-- schema change is reviewable on its own; 4.4-C fills bank_question_id and
-- 4.4-D moves the RPC onto it.
--
--   diagnostic_answers.bank_question_id     the new canonical question
--   past_exam_questions.source_question_id  migration lineage
--
-- ════════════════════════════════════════════════════════════════════════════
-- WHY TWO COLUMNS AND NOT A SWAPPED FOREIGN KEY
-- ════════════════════════════════════════════════════════════════════════════
-- diagnostic_answers already holds 295 rows across 40 sessions, and
-- question_id is NOT NULL and carries a RESTRICT foreign key to
-- diagnostic_question_bank. Retargeting that FK in place would mean rewriting
-- history, and the eleven in-progress sessions make that risk worse for no
-- gain: they are smoke sessions, and abandoning them automatically on a
-- hunch is exactly the kind of production edit this phase is avoiding.
--
-- So the old column stays put and keeps its meaning while it still has
-- readers. bank_question_id arrives alongside it as nullable, which is why
-- this file can run at all against 295 rows that have no value for it yet.
-- The day the old bank is dropped, question_id and its FK go with it, and
-- bank_question_id becomes the only question identity.
--
-- ════════════════════════════════════════════════════════════════════════════
-- WHY source_question_id CARRIES NO FOREIGN KEY
-- ════════════════════════════════════════════════════════════════════════════
-- It points at diagnostic_question_bank, the table this whole phase exists
-- to retire. A foreign key would make that retirement impossible: the DROP in
-- Phase 4.5 would fail on the very references whose source is being removed.
-- So the column records lineage and nothing enforces it.
--
-- That makes it a plain uuid whose value means only "this question came from
-- that one", and it is exactly as trustworthy as the 4.4-C backfill that
-- writes it. The partial unique index below is the guard that keeps it
-- honest: a source question can seed at most one bank question, so lineage
-- cannot fan out into a many-to-one that would quietly make history
-- ambiguous.
--
-- It is deliberately not source_note, which stays free for human-readable

-- ----------------------------------------------------------------------------
-- 1. Lineage on the exam bank
-- ----------------------------------------------------------------------------
-- Nullable: a question authored directly in the exam bank was never imported,
-- and inventing a source for it would be a lie about where it came from.

alter table public.past_exam_questions
  add column if not exists source_question_id uuid;

comment on column public.past_exam_questions.source_question_id is
  'diagnostic_question_bank.id this question was imported from. Lineage only, deliberately not a foreign key: that table is scheduled for removal in Phase 4.5 and a FK would block the drop. Null means the question was authored here.';

-- One source question seeds at most one bank question. Partial, because the
-- overwhelming majority of rows are null and a plain unique index would be
-- equally correct while storing a long run of nulls in a btree for nothing.
create unique index if not exists past_exam_questions_source_question_uniq
  on public.past_exam_questions (source_question_id)
  where source_question_id is not null;

-- ----------------------------------------------------------------------------
-- 2. Canonical question on the answer record
-- ----------------------------------------------------------------------------
-- Nullable for the same reason the backfill has not run yet. It becomes NOT
-- NULL only in 4.4-D, once the RPC refuses to write without it and nothing
-- legacy can still produce a row that lacks one.

alter table public.diagnostic_answers
  add column if not exists bank_question_id uuid;

comment on column public.diagnostic_answers.bank_question_id is
  'past_exam_questions.id. The canonical question identity; question_id is the legacy pointer to diagnostic_question_bank and goes away in Phase 4.5. Nullable until 4.4-C backfills it and 4.4-D makes it NOT NULL.';

-- RESTRICT, not CASCADE. An exam question that has been answered is part of a
-- student's record; deleting it should not silently delete the evidence of
-- what they chose. CASCADE is right for a question nobody answered and wrong
-- for one that was, and the database cannot tell which is which, so the
-- stricter option is the one that fails loudly.

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.diagnostic_answers'::regclass
      and conname  = 'diagnostic_answers_bank_question_id_fkey'
  ) then
    alter table public.diagnostic_answers
      add constraint diagnostic_answers_bank_question_id_fkey
      foreign key (bank_question_id)
      references public.past_exam_questions(id)
      on delete restrict;
  end if;
end
$$;

create index if not exists idx_diag_answers_bank_question
  on public.diagnostic_answers (bank_question_id);

-- The retry guard, restated for the new identity. UNIQUE(session_id,
-- question_id) already prevents a double answer, but only against the legacy
-- id; once the RPC keys on bank_question_id that constraint stops being what
-- stands between a flaky network and two rows for one question. Partial, for
-- the same nulls-not-stored reason as above. If the 4.4-C backfill ever tries
-- to give one session the same bank question twice, it aborts here rather
-- than writing it.
create unique index if not exists diagnostic_answers_session_bank_question_uniq
  on public.diagnostic_answers (session_id, bank_question_id)
  where bank_question_id is not null;

commit;

-- ============================================================================
-- VERIFICATION (run after)
-- ============================================================================
-- 1. Both columns exist and both are nullable, as intended for this stage:
--    select table_name, column_name, is_nullable
--      from information_schema.columns
--     where column_name in ('source_question_id','bank_question_id');
--    EXPECTED: two rows, both YES
--
-- 2. No data moved. This phase is schema only:
--    select (select count(*) from past_exam_questions)::int questions,
--           (select count(*) from diagnostic_answers)::int answers,
--           (select count(*) from diagnostic_answers where bank_question_id is not null)::int backfilled;
--    EXPECTED: 10, 295, 0
--
-- 3. The three new indexes and the new foreign key are in place:
--    select indexname from pg_indexes
--     where indexname in ('past_exam_questions_source_question_uniq',
--                          'idx_diag_answers_bank_question',
--                          'diagnostic_answers_session_bank_question_uniq');
--    EXPECTED: 3
--    select conname from pg_constraint
--     where conname = 'diagnostic_answers_bank_question_id_fkey';
--    EXPECTED: 1
--
-- 4. The legacy path is untouched, so nothing can regress before 4.4-D:
--    select count(*)::int from diagnostic_answers
--     where not exists (select 1 from diagnostic_question_bank b
--                        where b.id = diagnostic_answers.question_id);
--    EXPECTED: 0
--
-- 5. The backfill is still fully possible — a 10-row lineage that covers
--    every answer. The mapping is confirmed by exact text equality here only
--    as a dry run; 4.4-C resolves it by explicit old_id -> new_id pairing:
--    select count(*)::int from diagnostic_answers a
--     where not exists (
--       select 1 from diagnostic_question_bank b
--         join past_exam_questions t on t.question_text = b.question_text
--        where b.id = a.question_id);
--    EXPECTED: 0
--
-- 6. Session and answer counts unchanged, mastery untouched:
--    select (select count(*) from diagnostic_sessions)::int sessions,
--           (select count(*) from user_weaknesses)::int weaknesses;
--    EXPECTED: 40, unchanged
-- ============================================================================

-- provenance. A machine-readable pointer and a sentence are different
-- things, and overloading one column for both leaves the sentence unqueryable.
-- ============================================================================

begin;
